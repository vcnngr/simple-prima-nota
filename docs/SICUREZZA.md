# Fase «sicurezza»

Terza fase dell'ordine ratificato dal titolare (**workflow → sistema → sicurezza → UX**).
Workflow (W1–W6) e sistema (S1–S4, `docs/SISTEMA.md`) sono chiusi.
Ogni blocco è un branch `feat/k…`, con review `pn-gpt` prima della chiusura. Ogni correzione ha
uno smoke che fallisce sul codice di prima.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| K1 | Token | il token dice per quale tabella vale (`tipo`); solo HS256; password di almeno 8 caratteri alla registrazione; registrazione dello studio validata | `scripts/smoke/k1-token.sh` |
| K2 | IP e limiti | `trust proxy` corretto per ingress → nginx → backend e per il backend esposto direttamente (`X-Forwarded-For` scelto dal client); `RATE_LIMIT_*` letti davvero; `X-Forwarded-Proto` dietro TLS | da scrivere |
| K3 | Errori e log | niente `error.message` nelle risposte (13 punti, fra cui `DELETE /api/auth/account`); niente username o email nei log | da scrivere |
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
