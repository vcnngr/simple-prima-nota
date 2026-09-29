# Fase «UX»

Quarta fase dell'ordine ratificato dal titolare (**workflow → sistema → sicurezza → UX**).
Sicurezza chiusa il 2026-09-29 (`docs/SICUREZZA.md`).

Decisioni del titolare (29/09/2026):

- rifacimento completo di interfaccia e frontend, non ritocco;
- struttura «C · Estratto» (righe con saldo progressivo, tastierino, Report a flusso), niente
  `<table>`, filtri in bottom sheet, nessuno scroll orizzontale a 390 px;
- nessuna tendina con l'elenco intero: ogni scelta di un'entità cerca sul server, con un tetto;
- due temi, **Registro** (predefinito) e **Bottega**, ciascuno chiaro, scuro o automatico, scelti
  per account dalle impostazioni; i temi cambiano solo i token (colori, caratteri);
- frontend ricostruito con Vite e TanStack Query v5;
- parte backend della UX dopo la sicurezza, prima del frontend;
- ogni scelta visiva si decide su screenshot renderizzati (3-4 varianti), prima del codice.

Ogni blocco è un branch `feat/u…` con review `pn-gpt`; ogni correzione ha uno smoke che fallisce sul
codice di prima.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| U1 | Ricerca e paginazione | `GET /anagrafiche/cerca` (selettore), `GET /anagrafiche/elenco` (pagine, indice A–Z), movimenti con ordinamento applicato, cursore e saldo progressivo; indici (pg_trgm); id non interi → 400 | `scripts/smoke/u1-ricerca.sh` |
| U2 | Preferenze | tema e aspetto sull'account (utente e studio), API di lettura e modifica | da scrivere |
| U3 | Base del frontend | Vite, TanStack Query v5, token dei due temi, un solo shell utente/studio | da scrivere |
| U4 | Componenti | selettore con ricerca sul server, lista infinita, bottom sheet, campo importo, riga del registro | da scrivere |
| U5 | Pagine dell'utente | Estratto, nuovo movimento, controparti, filtri, report a flusso, impostazioni | da scrivere |
| U6 | Portale dello studio | pagine dello studio sul nuovo shell; via il vecchio frontend e gli endpoint rimasti per lui | da scrivere |

## U1 — Ricerca e paginazione

**Il problema.** Le due tendine delle anagrafiche nei movimenti caricavano l'elenco intero
(`GET /anagrafiche/attive`, senza limite); la pagina delle anagrafiche calcolava gli aggregati di
tutte le righe a ogni apertura; `LIKE '%…%'` senza indice leggeva tutta la tabella; `order_by` e
`order_direction` dei movimenti erano validati ma ignorati (sempre data decrescente); le liste
andavano solo a offset, che salta o ripete righe se nel frattempo se ne inseriscono; un id non
intero nel percorso arrivava a pg e dava 500 (aperto di K3); `%` e `_` digitati nei suggerimenti
delle categorie erano jolly.

**Come funziona ora.**

- `GET /api/anagrafiche/cerca?q=&tipo=&limit=&solo_attive=` — selettore della controparte. Al
  massimo 50 righe (predefinito 20) e `altri` se ce ne sono di più. Senza `q`: prima le controparti
  usate negli ultimi 12 mesi (per numero di movimenti, poi per data), poi in ordine alfabetico. Con
  `q`: cerca in nome e partita IVA, prima chi inizia con `q`; con `tipo` (Entrata/Uscita), a parità,
  prima le controparti di quel tipo o senza tipo.
- `GET /api/anagrafiche/elenco?q=&lettera=&tipologia_id=&attivo=&ordina=&limit=&offset=` — pagina
  delle controparti (al massimo 100 righe), `totale`, `altri`, aggregati solo per le righe della
  pagina, `lettere` (conteggio per iniziale, `#` per le iniziali fuori A–Z) per l'indice.
- `GET /api/movimenti`: ordinamento richiesto applicato, con l'id come spareggio; cursore `dopo`
  (`AAAA-MM-GG_id`, restituito in `pagination.cursore`) per le liste infinite in ordine di data;
  con `conto_id` ogni riga ha `saldo_progressivo`, il saldo del conto dopo quel movimento (ordine
  data, id), anche con altri filtri.
- `middleware/parametri.js`: `:id`, `:userId`, `:tokenId` non interi positivi a 32 bit → 400.
- `utils/ricerca.js`: il testo cercato entra nei `LIKE` con `%` e `_` protetti.
- Migrazione `012_ricerca_indici`: `pg_trgm` (estensione "trusted", la crea il proprietario del
  database), indice a trigrammi su `lower(anagrafiche.nome)`, `(user_id, lower(nome), id)`,
  `movimenti (user_id, data DESC, id DESC)` e `(conto_id, data, id)`. Il rollback toglie gli
  indici e lascia `pg_trgm`, che poteva esserci già.
- `GET /anagrafiche` e `/anagrafiche/attive` restano per il frontend attuale; si tolgono in U6.

**Prova**: `scripts/smoke/u1-ricerca.sh`. 3.506 controparti e 40 movimenti per un utente, un
secondo utente con un omonimo: id non interi su 9 rotte, ordini e filtri di `/cerca` e `/elenco`
(tetti, maiuscole, `%` e `_`, partita IVA, attive, dati altrui), indice A–Z, aggregati confrontati con
SQL, cursore percorso fino in fondo con inserimenti a metà (nessuna riga saltata o ripetuta), saldo
progressivo confrontato con `calcola_saldo_conto`, piani di esecuzione con gli indici nuovi,
rollback e riapplicazione della 012, copia nel chart.

Aperti: la ricerca non ignora gli accenti («etna» non trova «Ètna»; servirebbe `unaccent` con una
funzione immutabile); le iniziali accentate finiscono sotto `#` nell'indice.
