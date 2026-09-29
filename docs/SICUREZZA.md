# Fase «sicurezza»

Terza fase dell'ordine ratificato dal titolare (**workflow → sistema → sicurezza → UX**).
Workflow (W1–W6) e sistema (S1–S4, `docs/SISTEMA.md`) sono chiusi.
Ogni blocco è un branch `feat/k…`, con review `pn-gpt` prima della chiusura. Ogni correzione ha
uno smoke che fallisce sul codice di prima.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| K1 ✅ | Token | il token dice per quale tabella vale (`tipo`); solo HS256; password di almeno 8 caratteri alla registrazione; registrazione dello studio validata | `scripts/smoke/k1-token.sh` |
| K2 | IP e limiti | `trust proxy` corretto per ingress → nginx → backend e per il backend esposto direttamente (`X-Forwarded-For` scelto dal client); `RATE_LIMIT_*` letti davvero; `X-Forwarded-Proto` dietro TLS | `scripts/smoke/k2-ip.sh` |
| K3 | Errori e log | niente `error.message` nelle risposte (13 punti, fra cui `DELETE /api/auth/account`); niente username o email nei log | `scripts/smoke/k3-errori.sh` |
| K4 | Dipendenze | `xlsx@0.18.5` (vulnerabilità high, nessuna correzione su npm) da sostituire; `npm audit` di backend e frontend | da scrivere |
| K5 | Deploy | utenti demo `admin`/`demo` con password note creati da `init.sql` anche in produzione; `JWT_SECRET` di esempio accettato in produzione; CSP che ammette `http:`, `https:` e `'unsafe-inline'` | da scrivere |

## K1 — Token

**Il problema.** Utenti e studi stanno in due tabelle con due sequenze di id. Il token di uno studio
aveva `tipo: 'commercialista'`, quello di un utente nessun tipo, e il middleware `auth` delle rotte
dell'utente non lo guardava: cercava `id` in `utenti` e confrontava la versione delle credenziali
(`cv`), che per entrambi parte da 0. Chiunque registrasse uno studio (registrazione pubblica)
entrava come l'utente con lo stesso id: movimenti, conti, anagrafiche, backup completo, scrittura,
eliminazione dell'account. Non riguarda `main`, che non ha gli studi.

In più: `jwt.verify` senza elenco degli algoritmi; la registrazione dell'utente accettava password di
6 caratteri, quella dello studio nessuna validazione (password di un carattere, email qualsiasi).

**Come funziona ora.**

- `AccountService.firmaJwt` mette sempre `tipo` (`user` o `commercialista`) e firma HS256.
- `AccountService.verificaJwt` è l'unico punto di verifica (`auth`, `authEither`,
  `authCommercialista`): solo HS256; un token senza `tipo` è un token utente firmato prima di K1 (i
  token degli studi l'hanno sempre avuto); ogni altro tipo è rifiutato.
- `auth` rifiuta i token non `user`; `authEither` sceglie la tabella dal tipo.
- Registrazione: password 8–72 byte per utenti e studi (stesse regole del cambio password, W6);
  schema Joi `registrazioneCommercialista` (username, email, partita IVA, telefono). Il frontend
  chiede 8 caratteri. Le password già esistenti più corte continuano a funzionare.

**Prova**: `scripts/smoke/k1-token.sh`. Registra uno studio, porta la sequenza degli utenti al suo
id, e prova il token dello studio su 11 rotte dell'utente (lettura, scrittura, eliminazione); token
contraffatti col segreto giusto (tipo sconosciuto, HS384, `alg: none`); token utente senza tipo
ancora validi; registrazioni con password corte, troppo lunghe e dati non validi.

## K2 — IP e limiti

**Il problema.** `server.js` aveva `trust proxy 1` fisso: Express prende come indirizzo del client
l'ultimo elemento di `X-Forwarded-For`, fidandosi di un solo proxy, chiunque sia.

- Nel chart la catena è ingress → nginx del frontend → backend: due proxy. `req.ip` era l'ingress
  per tutti, quindi il tetto generale (300 richieste / 15 min per IP) e quello dei reset valevano
  per l'intera app: un solo client poteva bloccare tutti.
- Con il backend raggiungibile direttamente (compose pubblicava `3001` su tutte le interfacce) il
  client scriveva `X-Forwarded-For` e sceglieva il proprio indirizzo: tetti aggirati.
- Il log di accesso scriveva l'intestazione `X-Forwarded-For` grezza, cioè quello che il client
  dichiarava.
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` erano nei values e in `.env.example` ma il
  backend non li leggeva.
- nginx inoltrava `X-Forwarded-Proto` con il proprio schema (`http` dietro un ingress TLS).

**Come funziona ora.**

- `TRUST_PROXY` (`backend/config/proxy.js`): con un numero N si scavalcano al più N proxy e solo
  se l'indirizzo scavalcato è privato o loopback. Un client pubblico collegato direttamente non è
  mai trattato come proxy: la sua `X-Forwarded-For` si ignora. `0` = nessun proxy; un elenco di
  indirizzi o reti = solo quelli (un elenco non valido ferma l'avvio). Non impostata: `1`.
- Chart: `TRUST_PROXY` 2 con l'ingress, 1 senza; un valore in `backend.env.TRUST_PROXY` vince.
  Compose: `1`, e la porta 3001 è pubblicata solo su `127.0.0.1`.
- Tetto generale da `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`; senza, come prima (300 in
  produzione, 10000 fuori). Nel chart `RATE_LIMIT_MAX_REQUESTS` passa da 100 (mai applicato) a
  300, il tetto effettivo di prima.
- Log di accesso con `req.ip`, cioè la stessa regola dei tetti.
- nginx inoltra `X-Forwarded-Proto` dell'ingress se vale `http` o `https`, altrimenti il proprio
  schema. Il backend oggi non lo usa per decisioni (i link delle mail vengono da `FRONTEND_URL`).
- Dipendenza esplicita `proxy-addr` (già presente come dipendenza di Express).

**Prova**: `scripts/smoke/k2-ip.sh`. Avvia il backend del checkout con configurazioni diverse
(senza database: `/api/health` passa dal tetto generale): tetto configurato rispettato; client
separati dietro un proxy; catena ingress + nginx simulata con `X-Forwarded-For` a tre elementi (il
tetto e il log sono del client, non dell'ingress; l'indirizzo inventato non conta); backend esposto
(`TRUST_PROXY=0`); nginx del frontend vero davanti al backend; `X-Forwarded-Proto`; render del
chart e `compose config`. Non osservato: un ingress reale (la catena è simulata con le intestazioni
che un ingress scrive).

Aperti, fuori da K2: il tetto è per IP anche per le richieste autenticate (molti utenti dietro lo
stesso NAT aziendale condividono i 300); da rivedere con i dati d'uso.

## K3 — Errori e log

**Il problema.** Molte rotte rispondevano con `details: error.message` (export, anteprima, backup,
conti, eliminazione dell'account) o con `error.message` diretto (collegamento, disconnessione,
import CSV). Il messaggio di pg cita i valori ricevuti (`invalid input syntax for type integer:
"..."`), quello di bcrypt il tipo degli argomenti; il gestore globale in sviluppo restituiva
`err.message` e scriveva lo stack. Nei log: `console.error(..., error)` con l'oggetto intero
(messaggio, `detail` con le chiavi duplicate, stack), username nell'eliminazione dell'account, nomi
di categorie, conti e anagrafiche creati, righe del CSV importato, configurazione dell'export.

**Come funziona ora.**

- `backend/utils/errori.js`: `logErrore(contesto, err)` scrive solo contesto, SQLSTATE o codice
  (o il tipo, `TypeError`), nome del vincolo e file:riga di origine nel backend. Mai il messaggio.
- Risposte: messaggio generico scritto da noi. Restano i testi nostri: `RAISE EXCEPTION` delle
  funzioni SQL (SQLSTATE `P0001`, `messaggioApplicativo`), errori applicativi marcati (tipo di file
  non ammesso, errori dell'import CSV), validazione Joi.
- Righe rifiutate nell'import di backup e CSV: motivo per famiglia di SQLSTATE (`motivoRiga`:
  "gia' presente", "dati non validi"...), non il testo del driver.
- `config/database.js`: nel log degli errori di query SQLSTATE e vincolo, non il messaggio.
- Gestore globale: errori 4xx dei parser (charset, corpo troppo grande) restano 4xx, con
  "Richiesta non valida"; `error.log` e console con metodo, percorso senza query string e codice.
- `DELETE /auth/account` con password non stringa: 400, non 500 di bcrypt.
- Log applicativi: id al posto di username e nomi; niente righe di debug con i valori del CSV. `routes/backup.js` (non montato) resta com'era.

**Prova**: `scripts/smoke/k3-errori.sh`. Provoca errori veri (id non numerici, filtro dell'export che
rompe la query, riga di backup e di CSV rifiutate da pg, password non stringa, charset sconosciuto) e
controlla risposte (niente testo di pg, stack, `details`; i messaggi nostri restano) e la parte di
log scritta dalla corsa (niente username, email, nomi, valori del corpo, messaggi di pg, stack).

Aperti, fuori da K3: un id non numerico nel percorso produce ancora un 500 (risposta pulita, ma
dovrebbe essere 400: validazione dei parametri da fare con la UX backend); in sviluppo
`config/database.js` scrive il testo di ogni query (senza parametri).
