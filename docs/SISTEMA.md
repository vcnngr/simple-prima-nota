# Fase «sistema» — bug e debito di codice e deploy

Seconda fase dell'ordine ratificato dal titolare (**workflow → sistema → sicurezza → UX**).
Il workflow (W1–W6) è chiuso: vedi `docs/WORKFLOW_COLLEGAMENTO.md` §5.
Ogni blocco è un branch `feat/s…`, con review `pn-gpt` prima della chiusura.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| S1 ✅ | Migrazioni versionate | `database/migra.sh` + registro `schema_migrazioni`; compose e Helm lo usano entrambi; `pgcrypto` dalla migration 009 | `scripts/smoke/s1-migrazioni.sh` |
| S2 ✅ | Configurazione del backend nel chart | `FRONTEND_URL` pubblico, `SMTP_*`/`MAIL_FROM` con password da Secret, `NOTIFICHE_*`, `ALLEGATI_*`, `RESET_*`; PVC degli allegati con `fsGroup`; numeri non più in notazione esponenziale | `scripts/smoke/s2-config-chart.sh` |
| S3 ✅ | Dati e cancellazioni | eliminazione dell'account di uno studio senza perdere i dati dei clienti (migration 010); pulizia dei file degli allegati che nessun allegato nomina | `scripts/smoke/s3-eliminazione-studio.sh` |
| S4 ✅ | Pulizia deploy | una sola configurazione nginx per compose, Podman e Helm (modello con variabili d'ambiente); allegati oltre 1 MB non più fermati da nginx nel chart; PostgreSQL 16.15 ovunque (server ufficiali su bookworm, stessa glibc del 16.1) | `scripts/smoke/s4-deploy.sh` |

## S1 — Migrazioni versionate

**Il problema.** Lo schema arrivava ai database per due strade diverse, e nessuna aggiornava un
database esistente:

- docker-compose montava `init.sql` e le migration in `docker-entrypoint-initdb.d`: girano solo
  sul volume vuoto, e la 008 non c'era;
- il job Helm eseguiva solo `init.sql` (una copia incollata nella ConfigMap, già diversa dal file)
  e usciva `0` appena trovava le tabelle di base: un database di `main` restava senza 001–008 e
  il backend nuovo partiva su uno schema vecchio.

In più `init.sql` di `main` non installava `pgcrypto`, mentre `genera_token_invito` (001, 003) usa
`gen_random_bytes()`: su un database di `main` la funzione si crea ma fallisce alla prima chiamata.
La correzione è la migration **009** (`CREATE EXTENSION IF NOT EXISTS pgcrypto`), non una modifica
della 001: sui database anteriori al registro la 001 è `rilevata` e non si riesegue, quindi una
correzione lì dentro non arriverebbe proprio ai database storici (init + 001 dei primi commit) che ne
hanno bisogno. Il `_down` della 009 non toglie l'estensione: l'`init.sql` attuale la crea già.

**Come funziona ora.** Un solo script, `database/migra.sh`, per tutti gli ambienti:

- registro `schema_migrazioni` (versione, nome, SHA-256 del file, `eseguita`|`rilevata`);
- database vuoto → `init.sql` (versione 000) e poi tutte le migration in ordine;
- database esistente → solo quelle non registrate, ciascuna **in una transazione insieme alla sua
  riga di registro** (i `BEGIN;`/`COMMIT;` del file si tolgono);
- database anteriore al registro → riconosciuto dallo schema (impronte 000–008, congelate) e
  registrato come `rilevata` senza eseguire nulla; impronte non in sequenza → si ferma;
- advisory lock: esecuzioni concorrenti si mettono in fila;
- `init.sql` (che comincia con `DROP TABLE … CASCADE`) non gira mai se `utenti` esiste;
- una migration registrata non si modifica (SHA-256 diverso → si ferma); un database con migration
  che i file non conoscono → si ferma;
- `migra.sh stato`, `migra.sh annulla NNN` (solo l'ultima, con il suo `_down.sql`).

Dove gira:

- **docker-compose**: servizio `migra` (immagine postgres, `./database` in sola lettura); il
  backend parte solo con `service_completed_successfully`. Il db non esegue più script initdb.
- **Helm**: job `…-migrazioni` con hook `post-install,pre-upgrade` (negli upgrade lo schema si
  aggiorna prima del backend nuovo; se fallisce, l'upgrade si ferma). I file vengono da
  `helm-chart/files/database/`, copia di `database/` fatta da `scripts/sincronizza-helm-db.sh`
  (`--verifica` per il controllo); la ConfigMap è anch'essa un hook, così un pre-upgrade legge i
  file nuovi. Stesso job per CloudNativePG, PostgreSQL standalone e database esterno (le variabili
  `DB_*` vengono da un helper comune al backend). Tolti: `db-init-job.yaml`, la copia di `init.sql`
  nella ConfigMap, i mount initdb di CloudNativePG e dello standalone, `bootstrap.initSql`.

**Regola per le prossime migration**: nuovo file `database/migrations/NNN_nome.sql` (+
`NNN_nome_down.sql`), poi `scripts/sincronizza-helm-db.sh`. Non si tocca più `init.sql` per
aggiungere schema. Una correzione a una migration già applicata è una migration nuova.
`.gitignore` esclude `*.sql` ma non `database/` né `helm-chart/files/database/`: la copia del
chart va committata (lo smoke lo controlla).

Aperti, fuori da S1: `init.sql` crea gli utenti demo `admin`/`demo` con password note anche in
produzione (fase «sicurezza»); `Chart.yaml` non è stato incrementato (si fa al rilascio).

## S2 — Configurazione del backend nel chart

**Il problema.** Il chart passava al backend solo database, JWT e poche variabili di contorno:

- `FRONTEND_URL` era l'indirizzo interno del servizio (`http://<release>-frontend:80`): ogni link
  nelle mail (reset password, conferma email, notifiche) puntava a un host che il browser di chi
  riceve la mail non risolve;
- nessuna variabile `SMTP_*` / `MAIL_FROM`: nessuna mail partiva, le notifiche restavano in coda,
  il reset password non mandava niente;
- nessun volume per gli allegati della chat: stavano nel filesystem del container e sparivano a
  ogni riavvio del pod;
- i numeri dei values arrivano al template come float64: `MAX_FILE_SIZE: 10485760` diventava
  `"1.048576e+07"`, che `parseInt` legge come **1**. Senza `ALLEGATI_MAX_BYTES` il backend usa
  `MAX_FILE_SIZE`: ogni allegato veniva rifiutato con `413 "massimo 0 MB"`.

**Come funziona ora** (`helm-chart/values.yaml`, `templates/backend-deployment.yaml`,
`templates/backend-allegati-pvc.yaml`, helper in `_helpers.tpl`):

- `app.publicUrl` → `FRONTEND_URL`. Vuoto: schema e primo host di `ingress.hosts` (https se l'host
  è in `ingress.tls`). Senza ingress e senza `app.publicUrl` il render si ferma con un messaggio;
  un valore senza `http(s)://` pure.
- `backend.env`: ogni chiave diventa una variabile d'ambiente (le vuote non si passano, così il
  backend usa i suoi default); i numeri interi escono interi. Nuove chiavi: `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM`, `NOTIFICHE_*`, `RESET_PASSWORD_*`,
  `CONFERMA_EMAIL_ORE`, `ACCOUNT_MAIL_ATTESA_SEC`, `ALLEGATI_MAX_BYTES|QUOTA_BYTES|PULIZIA_MS`.
  Il chart imposta da sé `FRONTEND_URL`, `ALLEGATI_DIR`, `JWT_SECRET`, `SMTP_PASS` e `DB_*`.
- password SMTP solo da Secret: `backend.smtpPassword.existingSecret` + `key`, oppure `value`
  (finisce nel Secret del chart, chiave `smtp-password`); mai nel Deployment.
- allegati: PVC `<release>-allegati` montato su `/app/uploads/allegati`, con
  `helm.sh/resource-policy: keep` (un `helm uninstall` non cancella i documenti dei clienti);
  `existingClaim` per un volume già esistente; `fsGroup: 1001` (gruppo dell'utente `nodejs`
  dell'immagine) perché il volume nasce `root:root`. Con `ReadWriteOnce` la strategia è `Recreate`;
  più di una replica solo con `ReadWriteMany` (altrimenti il render si ferma), perché ogni replica
  deve vedere gli stessi file. `persistence.enabled: false` → `emptyDir` (perso al riavvio).

**Prova**: `scripts/smoke/s2-config-chart.sh`. Oltre al render nelle varianti, costruisce
l'immagine del backend dal checkout e la avvia con l'ambiente e i volumi del Deployment
renderizzato (Secret sostituiti; PVC simulato come lo prepara kubelet: radice `root:root 755`, poi
gruppo `fsGroup` con setgid e `fsGroup` fra i gruppi del processo): la mail di reset arriva a
mailpit con il link pubblico; un allegato da 270 KB si carica, finisce sul volume e si riscarica
identico dopo che il "pod" è stato sostituito. Senza `fsGroup` lo stesso upload dà `500`
(permesso negato sul volume): la simulazione non è vuota. Non osservato: un cluster Kubernetes
reale.

Aperti, fuori da S2:

- **dietro ingress il backend vede un solo IP** (fase «sicurezza», da fare per prima): la catena è
  ingress → nginx del frontend → backend e `server.js` ha `trust proxy 1`, quindi `req.ip` è
  l'indirizzo dell'ingress per tutti. Il limite generale (300 richieste / 15 min in produzione) e il
  tetto dei reset diventano globali per l'intera app. Va deciso insieme al problema opposto già
  noto (backend esposto direttamente → `X-Forwarded-For` scelto dal client).
- `RATE_LIMIT_*` e `LOG_LEVEL` sono nei values ma il backend non li legge (il limite è fisso in
  `server.js`): restano per compatibilità, da sistemare con il punto sopra.

## S3 — Dati e cancellazioni

**Il problema.** Nessuna rotta eliminava uno studio, e un `DELETE FROM commercialisti` (a mano o
da uno script) cancellava in cascata collegamenti, chat, allegati, notifiche e registro degli
accessi: dati del **cliente**, compresa la traccia di chi ha guardato i suoi conti. A parte, il
down della 007 toglie le tabelle degli allegati ma lascia i file su disco, che poi nessuno toglie.

**Come funziona ora** (migration 010):

- `DELETE /api/commercialisti/account` (`password`) → `elimina_account_commercialista()`, in una
  transazione sotto il lock della riga: collegamenti aperti revocati (`revocato_da = 'commercialista'`,
  motivo "Account dello studio eliminato"; il cliente riceve l'avviso della 006), notifiche per lo
  studio in coda annullate, link di reset/conferma annullati, username/email/telefono/P.IVA tolti
  (tornano liberi), password inutilizzabile, `versione_credenziali` avanti (ogni JWT muore),
  `eliminato_il` impostato. Restano la ragione sociale, la chat, gli allegati e il registro degli
  accessi. La password si ricontrolla sotto lock come nel cambio email (W6).
- Il DELETE fisico di uno studio con collegamenti è rifiutato: FK `RESTRICT` al posto di `CASCADE`.
  Vincolo: un account vivo ha username ed email; `auth`, `authEither`, login e reset escludono gli
  eliminati. Il cliente vede lo studio con `studio_eliminato: true` e senza contatti.
- Frontend: sezione "Elimina account" nel profilo dello studio (password + conferma esplicita);
  nella pagina collegamenti del cliente, "(account eliminato)" accanto al nome.
- Pulizia dei file orfani (`AllegatiService.pulisciOrfani`): all'avvio e ogni `ALLEGATI_ORFANI_MS`
  (1 h) rimuove da `ALLEGATI_DIR` i file regolari con nome da chiave (32 esadecimali, o `.tmp`) più
  vecchi di `ALLEGATI_ORFANI_MINUTI` (60) che nessuna riga di `allegati_messaggio` nomina. Se il
  database non risponde o le tabelle non ci sono, non cancella nulla.
- Rollback (`010_…_down.sql`): FK di nuovo `CASCADE`; gli studi eliminati restano senza accesso con
  username `#eliminato-<id>`; riapplicando la 010 tornano eliminati.

**Prova**: `scripts/smoke/s3-eliminazione-studio.sh` (mailpit, `ALLEGATI_DIR` condivisa): password e
tipo di token, effetti su studio e clienti (mail di avviso consegnate), cinque eliminazioni
simultanee (una sola `200`), password cambiata mentre la richiesta aspetta il lock (`400`), DELETE
fisico rifiutato, file orfani (solo quelli giusti), rollback 010→007 e riapplicazione con
`migra.sh` (i file lasciati dal down della 007 spariscono dopo).

**Gara con le notifiche (fix1, review pn-gpt).** Il worker delle notifiche legge il destinatario e
spedisce dentro una transazione che tiene la riga dello studio in `FOR SHARE`; l'eliminazione la
prende in `FOR UPDATE`. O l'eliminazione finisce prima (il worker trova l'indirizzo già tolto e
annulla), o aspetta che la mail sia partita: nessuna mail esce dopo il commit dell'eliminazione, e una
notifica annullata non torna `inviata` (`chiudi` aggiorna solo righe `in_coda`). Ordine dei lock
studio → notifica in entrambi i percorsi. Costo: un'eliminazione può attendere un invio SMTP (al più
il timeout di 20 s). Prova: sezione L dello smoke, `scripts/smoke/s3-gara-notifiche.js`.

Aperti, fuori da S3:

- la chat di un collegamento non più attivo non si legge dall'app (`getCollegamentoId` è
  fail-closed su `attiva`): vale per ogni revoca, non solo per l'eliminazione dello studio. I dati
  restano nel database; mostrarli in sola lettura è lavoro della fase UX;
- `DELETE /api/auth/account` (utente) restituisce `details: error.message` e scrive lo username nel
  log (fase «sicurezza»); i file dei suoi allegati vanno via con il trigger della 007, già prima di S3.

## S4 — Pulizia deploy

**Il problema.** Due configurazioni nginx diverse per lo stesso frontend:

- `frontend/nginx.conf` (nell'immagine) aveva scritto dentro il DNS di Podman (`resolver 10.89.0.1`):
  con Docker ogni chiamata `/api` restava appesa fino al timeout. Tutta la cache era spenta
  ("during development") e l'`add_header Cache-Control` dentro `location /` annullava le intestazioni
  di sicurezza del server su ogni pagina;
- il chart ne aveva una sua, inline nella ConfigMap: senza `client_max_body_size`, quindi ogni
  allegato della chat sopra 1 MB finiva in `413` in nginx prima di arrivare al backend (lo smoke S2
  usava un file da 270 KB); `index.html` in cache per un'ora, quindi dopo un rilascio il browser
  cercava script che non esistono più; nessun riavvio dei pod al cambio della ConfigMap.

PostgreSQL: compose, CloudNativePG e job delle migrazioni su 16.1, database standalone del chart su
15, README con tutte e due.

**Come funziona ora.**

- Una sola configurazione: `frontend/nginx/default.conf.template`. L'entrypoint di `nginx:alpine`
  la trasforma all'avvio sostituendo `BACKEND_UPSTREAM`, `CLIENT_MAX_BODY_SIZE` e
  `NGINX_LOCAL_RESOLVERS` (i DNS di `/etc/resolv.conf`: Docker, Podman e Kubernetes senza indirizzi
  scritti). Immagine: `backend:3001`, `11m`. Il chart ne monta una copia (`helm-chart/files/nginx/`,
  `scripts/sincronizza-helm-db.sh`, che ora copia anche questa) in `/etc/nginx/templates` e imposta
  l'FQDN del Service e il tetto calcolato da `ALLEGATI_MAX_BYTES` (MiB per eccesso + 1). Il montaggio
  funziona anche con le immagini già pubblicate. Annotazione `checksum/nginx` sui pod del frontend.
- Cache: `/static/` (nomi con hash) immutabile; `index.html` e le rotte `no-cache`; uno script in
  `/static/` che non c'è è `404`, non `index.html`. Le intestazioni stanno in un solo punto;
  `server_tokens off`. Tolto il proxy `/pgadmin/` in nginx: l'ingress instrada `/pgadmin` da sé.
- Immagine `nginx:1.30-alpine` invece di `nginx:alpine`.
- PostgreSQL 16.15 ovunque (compose `db` e `migra`, `cloudnativepg.cluster.imageName`,
  `migrazioni.image.tag`, `postgresql.image.tag`, smoke S1–S3). Dal 16.1 è un cambio di minor, **a
  patto che non cambi la glibc**: le collation di testo vengono dalla glibc del sistema, e con una glibc
  diversa l'ordinamento può cambiare, gli indici su colonne di testo possono diventare incoerenti e il
  server avvisa a ogni connessione `database "..." has a collation version mismatch`. L'immagine
  ufficiale `postgres:16.1` è Debian bookworm (glibc 2.36); `postgres:16.15` senza suffisso è Debian
  trixie (glibc 2.41). Per questo i server ufficiali che girano su un volume (compose `db`, e `migra`
  per coerenza; `postgresql.image.tag` del chart) sono fissati a **`16.15-bookworm`** (glibc 2.36).
  Il job delle migrazioni resta su `16.15-alpine`: usa solo `psql`, nessun dato. CloudNativePG non è
  toccato: `ghcr.io/cloudnative-pg/postgresql` 16.1 e 16.15 sono entrambe bullseye (glibc 2.31), e per
  CloudNativePG il passaggio è un aggiornamento a rotazione delle istanze.
  Passare in futuro a una glibc più nuova (trixie o oltre) è un'operazione a sé, con fermo scritture:
  con la nuova immagine, per ogni database `REINDEX DATABASE <db>;` (ricostruisce gli indici con le
  nuove regole; se un indice `UNIQUE` fallisce ci sono duplicati da sistemare a mano) e poi
  `ALTER DATABASE <db> REFRESH COLLATION VERSION;` (anche `template1` e `postgres`); solo dopo
  sparisce l'avviso. In alternativa `pg_dump`/ripristino su un volume nuovo. **Il database standalone** (`postgresql.enabled`,
  spento di default) passa da 15 a 16: un volume creato dal 15 non parte con il 16 ("database files are
  incompatible with server"), i dati restano intatti e con `postgresql.image.tag: "15"` riparte; per
  passare al 16 serve `pg_dump`/`pg_upgrade`.

**Prova**: `scripts/smoke/s4-deploy.sh`. Costruisce l'immagine del frontend dal checkout e la avvia su
una rete Docker con un finto backend chiamato `backend`; monta la configurazione e le variabili del
Deployment renderizzato su `nginx:1.30-alpine` e sull'immagine pubblicata, con il finto backend
raggiungibile col nome FQDN del Service. Allegati da 5 MB passano, da 12 MB `413`; con
`ALLEGATI_MAX_BYTES` a 20 MB il tetto diventa `21m`. `migra.sh` su 16.15 vuoto; aggiornamento reale:
volume creato da `postgres:16.1` con un indice `UNIQUE` su testo, riavviato con l'immagine di `db` letta
da `docker-compose.yml`, dati intatti, nessun `collation version mismatch` né in `psql` né nel log,
`datcollversion` uguale a `pg_database_collation_actual_version()` (con `postgres:16.15` trixie queste
prove falliscono); volume del 15 rifiutato dal 16 e di nuovo leggibile dal 15. Lo smoke non richiede più
PyYAML (solo `helm`, `awk` e `python3` di base). Non osservato: un cluster Kubernetes reale (il resolver lì è quello
di `resolv.conf` del pod).

Aperti, fuori da S4 (fase «sicurezza»): la CSP ammette `http:`, `https:` e `'unsafe-inline'`;
`X-Forwarded-Proto` è quello visto da nginx (`http` dietro un ingress TLS); `X-Forwarded-For` e
`trust proxy` (vedi S2); immagine di build `node:18` fuori supporto (la ricostruzione del frontend è
nella fase UX).

