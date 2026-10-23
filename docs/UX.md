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
- palette dei temi (principale / secondario / accento):

  | Tema | Chiaro | Scuro | Caratteri |
  |---|---|---|---|
  | Registro | `#1F45A0` blu penna / `#16213A` inchiostro / `#F2B825` evidenziatore | `#86A6FF` / `#C9D4EA` / `#F5C542` | Source Serif (importi), Atkinson Hyperlegible (testo) |
  | Bottega | `#2F4B3C` verde bottega / `#8A6A4A` cuoio / `#D9622B` terracotta | `#84B898` / `#CDA67F` / `#EE7A43` | Fraunces (importi), Instrument Sans (testo) |

  Principale: azione primaria, voce attiva della barra, link. Secondario: intestazioni, pulsanti
  secondari. Accento: il «+» al centro della barra, la controparte scelta, «Chiedi allo studio».
  Stati comuni ai temi: entrata (verde), uscita/pericolo (rosso), da chiarire (ambra), info/studio
  (azzurro), neutro (grigio). Il tema «Notte» è escluso;
- frontend ricostruito con Vite e TanStack Query v5;
- parte backend della UX dopo la sicurezza, prima del frontend;
- ogni scelta visiva si decide su screenshot renderizzati (3-4 varianti), prima del codice.

Decisioni del titolare (09/10/2026, su screenshot delle varianti U4):

- riga dell'Estratto: tutte e quattro le varianti (A due righe, B colonne, C iniziale e categoria,
  D libro mastro) scegliibili per account nelle impostazioni, come il tema; predefinita **A**;
- nuovo movimento: un solo percorso, «chi, poi quanto» (variante 3: prima la controparte, più usate
  in cima e ricerca sul server; poi l'importo con tipo e conto dedotti) con i tasti + − = della
  variante 2 per sommare gli scontrini;
- app iOS: sì, come fase **APP** dopo U6 (sezione in fondo). Da U4 il frontend si scrive già pronto
  per l'app: indirizzo del server in un solo punto, niente che dipenda dallo stesso dominio, margini
  sicuri del telefono.

Decisioni del titolare (22/10/2026, su screenshot delle varianti U6): **C** su tutte e sei le tavole.
Dove la C da sola non copre il caso, il complemento indicato dalla tavola stessa:

- collegamento: richiesta accettata in 3 passi (chi è → cosa vede → conferma); dopo, la gestione
  (periodo, conti, Sospendi, Revoca) come scheda dello studio (A);
- allegati: scheda «Documenti» accanto ai messaggi; l'invio resta dalla 📎 della chat;
- controparti: «+ Crea» nel selettore «Chi?» mentre si registra; la modifica dalla scheda con il
  pannello breve (A);
- conti: carte da sfogliare con i movimenti sotto; ✎ e ＋ aprono la pagina del conto (B);
- studio: home «Da fare» di tutti i clienti; scheda del cliente come riepilogo da cui si entra nel
  dettaglio.

Ogni blocco è un branch `feat/u…` con review `pn-gpt`; ogni correzione ha uno smoke che fallisce sul
codice di prima.

| # | Blocco | Contenuto | Prova |
|---|---|---|---|
| U1 ✅ | Ricerca e paginazione | `GET /anagrafiche/cerca` (selettore), `GET /anagrafiche/elenco` (pagine, indice A–Z), movimenti con ordinamento applicato, cursore e saldo progressivo; indici (pg_trgm); id non interi → 400 | `scripts/smoke/u1-ricerca.sh` |
| U2 ✅ | Preferenze | tema e aspetto sull'account (utente e studio), API di lettura e modifica; migrazione 013 | `scripts/smoke/u2-preferenze.sh` |
| U3 ✅ | Base del frontend | `web/`: Vite, TanStack Query v5, React Router 7, token dei due temi, un solo shell utente/studio, login, impostazioni di tema e aspetto | `scripts/smoke/u3-web.sh` |
| U4 ✅ | Componenti e registrazione | bottom sheet, selettore della controparte sul server, lista infinita a cursore, tastierino con somma, quattro righe dell'Estratto scelte per account (migrazione 014); Estratto per conto e nuovo movimento collegati all'API | `scripts/smoke/u4-componenti.sh` |
| U5 ✅ | Pagine dell'utente | movimenti con filtri, modifica ed eliminazione, controparti, report a flusso, studio | `scripts/smoke/u5-pagine.sh` |
| U6a ✅ | Registro dell'utente | collegamento con lo studio (richiesta in 3 passi, permessi: periodo e conti, sospendi, chiudi; `PUT /utenti/collegamenti/:id/ambito`), 📎 e Documenti nella chat (`GET /messaggi/documenti`), «+ Crea» nel selettore e modifica della controparte, conti come carte e pagina del conto | `scripts/smoke/u6a-registro.sh` |
| U6b | Account e archivio | registrazione, password dimenticata, conferma email, profilo (password, email, eliminazione), inviti allo studio, categorie e tipologie, import con anteprima, export, copia di sicurezza | `scripts/smoke/u6b-account.sh`, `scripts/smoke/u6b-archivio.sh` |
| U6c | Portale dello studio | home «Da fare», scheda del cliente come riepilogo, chat, report ed export registrati | da scrivere |
| U6d | Via il vecchio frontend | `web/` in compose e chart al posto di `frontend/`; tolti gli endpoint rimasti per lui | da scrivere |

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

## U2 — Tema e aspetto sull'account

**Il problema.** I due temi del nuovo frontend (Registro, Bottega) e l'aspetto (chiaro, scuro,
automatico) devono seguire l'account: chi entra da un altro dispositivo ritrova la sua scelta. Il
browser ne tiene solo una copia locale per disegnare la prima pagina senza sfarfallio.

**Come funziona ora.**

- Migrazione `013_preferenze_aspetto`: colonne `tema` (`registro` | `bottega`, predefinito
  `registro`) e `aspetto` (`chiaro` | `scuro` | `automatico`, predefinito `automatico`) su `utenti`
  e `commercialisti`, `NOT NULL` con `CHECK`. Gli account esistenti prendono i predefiniti. Il
  rollback toglie le colonne.
- `GET/PUT /api/auth/preferenze` (utente) e `GET/PUT /api/commercialisti/preferenze` (studio). Il
  `PUT` accetta `tema`, `aspetto` o entrambi (almeno uno), solo i valori ammessi e in minuscolo;
  aggiorna solo i campi inviati e restituisce le preferenze risultanti. Campi in più ignorati.
- Il login restituisce `preferenze: { tema, aspetto }` (per lo studio accanto a `commercialista`,
  non dentro); `GET /auth/profile` e `GET /commercialisti/profile` hanno `preferenze`. Login e
  profilo non dipendono dalle colonne: se le preferenze non si leggono (schema sotto la 013 dopo un
  rollback) arrivano `null` e il frontend usa i predefiniti. Senza questo, annullare la 013 con il
  codice di U2 chiudeva fuori tutti (login 500).
- `services/PreferenzeService.js`: tabella scelta dal tipo del token già verificato, mai dall'input.

**Prova**: `scripts/smoke/u2-preferenze.sh` (46 controlli): token mancanti e dell'altro tipo,
predefiniti, aggiornamenti parziali, sette corpi rifiutati (valore fuori elenco, vuoto, `null`,
array, maiuscole, nessun campo), isolamento fra utenti e fra studio e utente con lo stesso id, login
e profili, `CHECK` e `NOT NULL` nel database, rollback (API → 500 generico, senza messaggi pg) e
riapplicazione (login e profili 200 anche senza colonne), copia nel chart. Sul codice di prima
(`dc96c21`): 37 FAIL su 42; sul primo commit di U2 (`459c9e1`) 5 FAIL.

**Dipendenze (avvisi usciti dopo K4).** Il 05/10 è uscito un avviso critical su `proxy-addr`
(GHSA-jqcg-44mw-7w3h), corretto nella 2.0.8: il backend senza lockfile la prende già; nel frontend
(dev server CRA) `npm audit fix` senza `--force`. jest e nodemon hanno avvisi (braces, sprintf-js)
senza correzione a monte: l'immagine del backend ora installa solo le dipendenze di produzione
(`--omit=dev`) e `k4-dipendenze.sh` conta quelle. tailwind 3 resta segnalato: solo build.

## U3 — Base del nuovo frontend

**Il problema.** Il frontend attuale (CRA, react-query 3, axios, Tailwind 3) porta gli avvisi di
`npm audit` di `react-scripts` e non ha né temi né shell unico per utente e studio. Si riscrive da
capo (decisione del titolare), quindi il nuovo frontend nasce accanto al vecchio e lo sostituisce in
U6; fino ad allora compose e chart servono ancora `frontend/`.

**Come funziona ora.**

- `web/`: Vite 8, React 19, React Router 7, TanStack Query v5, Tailwind 4, lucide-react. Lockfile
  versionato; `npm audit --omit=dev` pulito. Build in `web/dist`: file con hash in `/static/` (la
  regola di cache immutabile di nginx vale già), niente mappe dei sorgenti, niente script in linea.
- Temi: `src/tema/token.css` definisce i token (`--pn-…`: colori e caratteri) per Registro e Bottega,
  chiaro e scuro; `automatico` segue `prefers-color-scheme`. Tailwind li espone come classi
  (`bg-principale`, `text-uscita`, `font-importi`, …): i componenti non scrivono mai un colore. I
  caratteri sono serviti dal sito (`@fontsource`), nessuna richiesta a Google.
- Tema prima del primo disegno: `public/tema-iniziale.js` (file del sito, non in linea: CSP) legge
  la copia locale `pn_preferenze`. Dopo login o ricarica vincono le preferenze dell'account (U2);
  se il server risponde `null` resta la copia locale, poi i predefiniti.
- Sessione (`src/sessione/Sessione.jsx`): un tipo alla volta. Login utente → `localStorage.token`,
  studio → `localStorage.commercialista_token`; ogni login toglie il token dell'altro tipo. Un 401
  con un token chiude la sessione e riporta al login del suo tipo. Le pagine di un tipo rifiutano
  la sessione dell'altro.
- Un solo client (`src/api/client.js`, `fetch`): l'unico punto che chiama `/api`.
- Shell (`src/shell/`): a 390 px intestazione in alto e barra in basso (Estratto, Movimenti, «+»
  al centro, Report, Studio); da `md` colonna a sinistra. Lo studio ha le sue voci, senza «+».
- Pagine: login utente e studio, impostazioni (tema e aspetto, salvati con `PUT …/preferenze`,
  applicati subito e annullati se il server rifiuta, uscita). Le altre sono segnaposto con il
  campionario dei token, sostituite in U5 e U6.
- `scripts/smoke/lib/cdp.mjs`: pilota di Chrome headless via DevTools, senza dipendenze, per gli
  smoke del frontend; registra ogni violazione della CSP.

**Prova**: `scripts/smoke/u3-web.sh` (50 controlli): progetto e dipendenze, build (mappe, script in
linea, font esterni, `/static/`), colori ratificati nei token, `fetch` solo nel client; poi la build
servita da nginx con `frontend/nginx/default.conf.template` e Chrome headless: login sbagliato e
giusto dei due tipi, token separati, tema dall'account e non dalla copia locale, cambio di tema e
aspetto salvato sull'account, `automatico` che segue il sistema, pagine dell'altro tipo rifiutate,
uscita, token rifiutato → login, 390 px senza scroll orizzontale, desktop, zero violazioni CSP
(controprova: uno script in linea nella build dà 12 violazioni e FAIL).

Aperti: `web/` non ha ancora Dockerfile né posto in compose e chart (U6); i segnaposto mostrano
importi di esempio.

## U4 — Componenti e registrazione

**Il problema.** Le pagine del nuovo frontend hanno bisogno di pezzi comuni (finestra dal basso,
scelta della controparte fra migliaia, lista che carica a pagine, importo senza errori di
arrotondamento) e della prima funzione vera: guardare l'estratto e registrare un movimento.

**Come funziona ora.**

- Migrazione `014_vista_estratto`: colonna `vista_estratto` (`due_righe` | `colonne` | `iniziali` |
  `mastro`, predefinita `due_righe`) su `utenti` e `commercialisti`, `NOT NULL` con `CHECK`; letta e
  scritta da `GET/PUT …/preferenze` (U2) insieme a tema e aspetto, nel login e nei profili. Il
  rollback toglie la colonna; senza colonna le preferenze rispondono 500 generico e login e
  profili 200 con `preferenze: null` (il frontend usa la copia locale, poi i predefiniti).
- `GET /movimenti`, `GET /movimenti/:id`, `POST` e `PUT /movimenti` portano anche `giorno` (`YYYY-MM-DD`).
  `data` resta com'era per il vecchio frontend, ma pg la serializza dalla mezzanotte del fuso del
  server: con il backend in Europe/Rome il 9 ottobre arriva come `2026-10-08T22:00:00.000Z`.
- In ingresso le date sono giorni di calendario (`YYYY-MM-DD`, helper `giorno()` in
  `middleware/validation.js`) e arrivano a pg come stringhe: data del movimento (POST/PUT), filtri
  `data_inizio`/`data_fine` (movimenti, report, export, export dello studio), ambito del
  collegamento. Prima `Joi.date()` ne faceva una Date a mezzanotte UTC che pg riscriveva nel fuso
  del backend: a ovest di UTC il movimento del 10 finiva sul 9 (RED di pn-gpt, `t_34501f24`).
  Giorni impossibili (`2026-02-30`), timestamp e altri formati: 400. Anche l'anno `0000`: per `Date`
  esiste, per pg no (500 prima del secondo RED, `t_5c3ad1c0`); si parte da `0001-01-01`.
- `web/src/util/`: importi in centesimi interi (dal testo del server al testo per l'API, mai
  `parseFloat`), tastierino con + − = come funzione pura, giorni nel fuso del dispositivo (mai
  `toISOString`).
- Componenti: `BottomSheet` (`<dialog>` nativo: focus dentro, Esc chiude), `SelettoreControparte`
  (`GET /anagrafiche/cerca`: senza testo le più usate, poi la ricerca, tetto 20), `ListaInfinita`
  (cursore di U1, `IntersectionObserver` e pulsante), `Tastierino`, le quattro righe in
  `componenti/righe/Righe.jsx` (stessi dati, raggruppati per giorno; C mostra il saldo a fine
  giornata).
- Estratto (`/`): saldo del conto, scelta del conto nel bottom sheet (ricordata sul dispositivo),
  righe nella vista dell'account. Nuovo movimento (`/nuovo`, il «+»): controparte, poi importo con
  tipo dalla controparte, data di oggi, conto dell'Estratto, descrizione predefinita = controparte;
  un tocco su Registra registra una volta sola anche se ripetuto.
- `src/api/client.js`: base dell'API da `VITE_API_BASE` (vuota = stesso sito), per la fase APP.

**Prova**: `scripts/smoke/u4-componenti.sh` (116 controlli, backend con `TZ=America/Los_Angeles`
dichiarato in `TZ_BACKEND`): logica pura (22: 0,1 + 0,2 = 0,30,
decimali, tetto di 10 cifre, cancella, segni, giorni a cavallo del mese) con `TZ=Europe/Rome`;
vista sull'account (valori rifiutati, login, profilo, studio, token dell'altro tipo, isolamento);
`giorno` uguale alla data del database su 75 movimenti; `CHECK`, rollback e riapplicazione della 014;
build; nel browser con la CSP vera: Estratto a cursore fino in fondo senza righe ripetute, saldo
uguale a `calcola_saldo_conto`, le quattro viste scelte dalle impostazioni a 390 px, cambio di
conto, nuovo movimento con ricerca sul server e somma 12,40 + 6,50, totale negativo rifiutato, Esc,
tre tocchi su Registra; poi nel database importo, tipo, controparte, giorno e conto. Sul codice di
prima (`548fd64`): 23 FAIL. Il doppio tocco l'ha trovato lo smoke: prima della correzione tre tocchi
registravano tre movimenti. Dopo il RED: data inviata = data salvata in POST e PUT, filtro sul
giorno esatto, cinque formati rifiutati; sul backend di `5299a83` a Los Angeles 10 FAIL (il 18,90
registrato «oggi» finiva su ieri). Dopo il secondo RED: `giorno` nella risposta del PUT, anno
`0000` rifiutato in POST, PUT e filtri, `0001-01-01` accettato; sul backend di `273205c` 6 FAIL.

Aperti: lo stato «da chiarire» dei mockup non esiste nello schema (nessuna colonna): le righe
mostrano solo entrata e uscita; modifica ed eliminazione del movimento arrivano in U5 (risolti in U5).

## U5 — Pagine dell'utente

**Scelte ratificate (10/10/2026, sui mockup in Registro chiaro).** Movimenti: etichette dei filtri
sotto la ricerca (A con la ricerca di B). Dettaglio: scheda dal basso (A) con lo scorrimento della
riga come scorciatoia (C). Controparti: schede con il totale, piu' movimentate in cima, A–Z come
ordine (B), scheda della controparte al tocco (C). Report: mese per mese (C), tocco = il mese (A).
Studio: riepilogo (C), chat con la fascia dei movimenti da chiarire (A).

- «Da chiarire» senza migrazione: e' una richiesta di chiarimento aperta (W5, `chiarimento_stato =
  'aperta'`) su un collegamento attivo. `GET /movimenti` e `GET /movimenti/:id` portano
  `da_chiarire`; filtro `da_chiarire=true|false`. Collegamento sospeso: nessuna etichetta.
- `GET /reports/mesi?fino=YYYY-MM&mesi=1..36[&conto_id][&anagrafica_id]`: mese per mese dal piu'
  recente (predefinito: il mese del database). `GET /reports/mese?mese=YYYY-MM[&conto_id]`: entrate
  per controparte, uscite per categoria (`categoria`, poi tipologia, poi «Senza categoria»). Mesi e
  importi come testo, mai Date ne' virgola mobile; mesi fuori formato o anno < 1000: 400.
- `GET /messaggi/chiarimenti`: per il cliente anche il movimento (giorno, importo, controparte);
  lo studio continua a riceverne solo l'id (l'ambito puo' essere cambiato dopo la richiesta).
- `GET /utenti/collegamenti`: `ambito_dal`/`ambito_al` come giorni `YYYY-MM-DD` (prima un Date che
  slittava col fuso del server).
- Frontend: `/movimenti` (filtri nell'indirizzo: `q`, `tipo`, `conto`, `dal`, `al`, `controparte`,
  `chiarire`; valori non validi ignorati), `/controparti`, `/controparti/:id`, `/report`,
  `/report/:mese`, `/studio`, `/chat`; `/nuovo?controparte=<id>` parte dall'importo. Componenti
  `ModuloMovimento` (nuovo e modifica, PUT), `DettaglioMovimento` (Modifica, Elimina con conferma,
  Chiedi allo studio), `RigaMovimento` (scorrimento: Studio, Elimina con 5 s per annullare; lasciando
  la pagina l'eliminazione chiesta si compie). Le righe dell'Estratto si aprono col tocco.

**Prova**: `scripts/smoke/u5-pagine.sh` (111 controlli, backend con `TZ=America/Los_Angeles`):
somme dei report uguali al database per mese, conto e controparte; isolamento fra utenti; 11 valori
rifiutati; `da_chiarire` con richiesta aperta, sospensione, riattivazione, risoluzione; poi nel browser
con la CSP vera: ricerca, etichette, pannello, modifica col tastierino, eliminazione con conferma,
scorrimento con Annulla (il movimento resta) e senza (sparisce dopo 5 s), «+ Movimento» dalla
controparte, report, chat con invio e «Chiarito», 390 px su ogni pagina; poi nel database. Sul
backend di `4ed57a8`: 50 FAIL.

Aperti (prima di togliere il vecchio frontend in U6): gestione del collegamento lato utente
(accetta con ambito, sospendi, revoca), allegati nella chat (invio e scaricamento), modifica e
creazione delle controparti, conti. Orari della chat: `created_at` e' un `TIMESTAMP` senza fuso e
pg lo legge nel fuso del backend; con il backend in UTC (immagini) e' giusto, con un backend in un
altro fuso l'ora si sposta.

## U6a — Registro dell'utente

U6 diviso in quattro blocchi (22/10/2026, scelta lasciata a pn-claude dal titolare): prima tutto
cio' che il vecchio frontend sa fare e il nuovo no, poi il portale dello studio, poi via il vecchio.
Il vecchio frontend resta servito da compose e chart fino a U6d.

- `PUT /utenti/collegamenti/:id/ambito` `{ ambito_dal, ambito_al, conti_ammessi }`: solo da
  `attiva` o `sospesa` (409 altrimenti), stato invariato, stesse regole dell'accettazione (conti
  dell'utente, fine non prima dell'inizio, conti doppi salvati una volta). Prima l'ambito si
  sceglieva solo accettando: per cambiarlo bisognava chiudere e ricollegarsi.
- `GET /messaggi/documenti`: i file del collegamento, piu' recenti prima; per lo studio il
  movimento citato solo se ancora dentro l'ambito (come `GET /messaggi`), accesso registrato come
  `chat` (una volta all'ora).
- Correzioni trovate scrivendo le pagine: `POST /anagrafiche` ignorava `tipo_movimento_preferito`;
  `POST`/`PUT /anagrafiche` accettavano la tipologia di un altro utente; `PUT` con nome doppio dava
  500 e con P.IVA doppia passava; `PUT /conti-bancari` accettava l'IBAN di un altro conto.
- Frontend: `/studio` (richieste in cima, «Rispondi» = chi è → cosa vede → conferma; sospeso con
  «Riattiva»), `/studio/permessi/:id` (cosa vede, ultimi accessi, sospendi, chiudi con spiegazione),
  chat con 📎 e scheda Documenti (download col token: blob, mai link diretto), `/conti` (carte),
  `/conti/nuovo`, `/conti/:id` (saldo iniziale con avviso), pannello «Modifica» della controparte
  (disattiva, elimina solo senza movimenti), «+ Crea «nome»» nel selettore «Chi?». Ingressi: Impostazioni
  (Conti, Controparti, Studio), «Gestisci i conti» nel pannello dei conti dell'Estratto.

**Prova**: `scripts/smoke/u6a-registro.sh` (105 controlli, backend `TZ=America/Los_Angeles`). Sul
codice di prima (`a2cc71c`): 41 FAIL.

Aperti: gli orari (richiesta, documenti, chat, accessi) sono `TIMESTAMP` senza fuso letti nel fuso
del backend: con il backend a Los Angeles la richiesta del 22 sera appare del 23. Si corregge in
U6c insieme alla chat dello studio.

## U6b — Account e archivio

- Account (parte 1, nessun cambio al server): `/registrati` e `/studio/registrati`, password
  dimenticata e `/reimposta-password` (anche `/commercialista/...` dei link gia' spediti),
  `/conferma-email`, `/account` (email, password con sessione che resta aperta, dati dello studio,
  codice d'invito mostrato una volta e revocabile, eliminazione con password e conferma). Il codice
  della mail si toglie dall'indirizzo della pagina appena letto.
- Import CSV (`POST /movimenti/import`): tutto il file in una transazione, ogni riga in un savepoint
  (una riga sbagliata non lascia controparti, conti o categorie a meta'); `?anteprima=1` fa lo stesso
  lavoro e annulla. Risposta con `totali` (entrate, uscite) come testo. Importi in centesimi interi:
  `1.234,50`, `6,5`, `1234.5`; rifiutati `1.234` (ambiguo), lettere, tre decimali, negativi, oltre
  10 cifre (prima `parseFloat`: `12abc` diventava 12). Giorni veri, `AAAA-MM-GG` o `GG/MM/AAAA`
  (prima il 30/02 diventava il 2 marzo). Il conto si trova per nome esatto (prima «Cassa» finiva su
  «Cassa Rurale»). BOM tollerato, al massimo 10000 righe.
- Categorie: rinominare porta con se' `movimenti.categoria` / `anagrafiche.categoria` (tengono il
  nome) nella stessa transazione; `/categorie-anagrafiche` lavorava sulla tabella
  `categorie_movimenti` (copia del file dei movimenti): ora usa `categorie_anagrafiche`; utilizzi ed
  eliminazione contano solo i dati dell'utente; `DELETE /categorie-movimenti/:id` era sempre 500
  (`execute` inesistente); nomi ripuliti dagli spazi; tipologia con nome doppio 400 (era 500).
- Copia di sicurezza (`POST /auth/backup/import`): tutto o niente. Prima «replace» cancellava i dati e
  le righe che non entravano si perdevano in silenzio; ora un solo errore annulla tutto (400 con
  l'elenco, «nessun dato e' stato cambiato»). Modalita' solo `replace` o `merge`.
- `POST /export/generate`: applica i predefiniti di Joi (senza `ordine` era 500).
- Frontend: `/categorie` (movimenti, controparti, tipologie; nuova, rinomina con avviso sugli
  utilizzi, disattiva, elimina solo se non in uso), `/archivio` (import con anteprima e conferma,
  modello CSV, export Excel/CSV/PDF del periodo, copia e ripristino con avviso su «Sostituisci tutto»).
  Ingressi da Impostazioni.

**Prova**: `scripts/smoke/u6b-account.sh` (66 controlli) e `scripts/smoke/u6b-archivio.sh`
(80 controlli), backend `TZ=America/Los_Angeles`. Sul codice di prima: account fermo al primo passo
(nessuna registrazione dall'accesso), archivio 37 FAIL su 55.

Review RED (t_ce10aed8, 2 P0) corretti in 6d513c1: nella copia anche un avviso (`alerts`) che non
entra annulla tutto (prima si ignorava e «sostituisci» cancellava gli avvisi di prima); due import
insieme con la stessa controparte nuova (`ON CONFLICT DO NOTHING` + lettura): prima il secondo
scartava tutte le sue righe. Sul commit 69c317e i 4 controlli nuovi falliscono (300 righe perse su
600, avviso cancellato con 200).

## Fase APP — app iOS (dopo U6)

Ratificata il 09/10/2026; non parte prima della fine di U6.

- **Modalità A, app collegata a un server**: Capacitor impacchetta `web/`; l'indirizzo del server si
  sceglie nelle impostazioni dell'app (`src/api/client.js` è l'unico punto da cambiare); CORS del
  backend con l'origine dell'app; token nel Keychain invece che in `localStorage`.
- Funzioni native, anche per la regola 4.2 della review di Apple (un sito impacchettato viene
  respinto): Face ID all'apertura, fotocamera per gli scontrini allegati al movimento, menu di
  condivisione per gli export, notifiche dei messaggi dello studio.
- Per Apple: account demo su un server pubblico, cancellazione dell'account dall'app
  (`DELETE /auth/account`, esiste già).
- Prova intermedia dopo U5: app nel simulatore collegata a un backend di prova, screenshot al
  titolare.
- **Modalità B** (dati sul telefono, sincronizzazione facoltativa): da decidere dopo; richiede
  replica locale di saldi e categorie e gestione dei conflitti.

