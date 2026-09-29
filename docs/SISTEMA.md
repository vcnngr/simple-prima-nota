# Fase «sistema» — bug e debito di codice e deploy

Seconda fase dell'ordine ratificato dal titolare (**workflow → sistema → sicurezza → UX**).
Il workflow (W1–W6) è chiuso: vedi `docs/WORKFLOW_COLLEGAMENTO.md` §5.
Ogni blocco è un branch `feat/s…`, con review `pn-gpt` prima della chiusura.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| S1 | Migrazioni versionate | `database/migra.sh` + registro `schema_migrazioni`; compose e Helm lo usano entrambi; `pgcrypto` dichiarata dalla 001 | `scripts/smoke/s1-migrazioni.sh` |
| S2 | Configurazione del backend nel chart | `SMTP_*`, `MAIL_FROM`, `FRONTEND_URL` pubblico (oggi è l'URL interno del servizio: i link nelle mail non si aprono), volume per `ALLEGATI_DIR`, `NOTIFICHE_*` | `helm template` + job/deployment eseguiti come in S1 |
| S3 | Dati e cancellazioni | cancellazione dell'account commercialista (oggi in cascata su collegamenti, registro e chat del cliente); file degli allegati orfani dopo il down della 007 | smoke dedicato |
| S4 | Pulizia deploy | `nginx.conf` deploy-neutral, versione di PostgreSQL (README 16, chart standalone 15) | build + `compose config` + `helm template` |

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
aggiungere schema.

Aperti, fuori da S1: `init.sql` crea gli utenti demo `admin`/`demo` con password note anche in
produzione (fase «sicurezza»); `Chart.yaml` non è stato incrementato (si fa al rilascio).
