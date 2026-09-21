# Workflow collegamento utente ↔ commercialista — revisione critica e ridisegno

Stato: **proposta**, in attesa di ratifica del titolare e review `pn-gpt`.
Branch: `feat/workflow-collegamento`. Base: `feature/commercialisti-system`.
Data: 2026-09-21.

Questo documento riguarda **solo il workflow** (fase 1 del piano). Le correzioni di codice,
il fix di sicurezza su `auth.js` e il ridisegno UX sono fasi separate.

---

## 1. Il workflow attuale, come è realmente implementato

Ricostruito dal codice, non dalla documentazione.

```
UTENTE                                   COMMERCIALISTA
  │
  │ POST /api/utenti/genera-token-invito
  │   { giorni_validita: 365 }           ← il frontend passa 365, non il default 30
  │   → genera_token_invito()
  │     encode(gen_random_bytes(32),'hex')
  │
  │ copia il token (64 char)
  │
  ├──── canale fuori banda ─────────────►│  WhatsApp, email, SMS, a voce
  │      (non gestito dal sistema)        │
  │                                       │
  │                                       │ POST /api/commercialisti/collega-cliente
  │                                       │   { token }
  │                                       │   → usa_token_invito()
  │                                       │     • INSERT collegamenti (attivo=TRUE)
  │                                       │     • UPDATE utenti.commercialista_id
  │                                       │     • UPDATE token_inviti.usato=TRUE
  │                                       │
  │   ✗ nessuna notifica                  │ ✓ accesso immediato e completo:
  │   ✗ nessuna conferma richiesta        │   tutti i conti, tutti gli IBAN,
  │   ✗ nessuna traccia                   │   tutto lo storico, export CSV/XLSX/PDF
```

Disconnessione: unilaterale da entrambi i lati, `attivo = FALSE`. Nessuna notifica, nessuna
data, nessun motivo. Lato utente azzera anche `utenti.commercialista_id`; lato commercialista
**no** (bug già provato: colonna desincronizzata).

Superficie effettiva del commercialista sui dati del cliente: **sola lettura + export**
(`GET /clienti/:userId`, `POST /clienti/:userId/export`) più chat. Nessuna scrittura. È corretto,
ma è un fatto accidentale: non esiste un concetto di ruolo o di permesso che lo garantisca.

---

## 2. Cosa non va — per gravità

### 2.1 L'invito è un passe-partout, non un invito

Il token è un **bearer secret**: chiunque lo possieda ottiene l'accesso completo alla contabilità.
Non è legato a un destinatario. Se l'utente lo incolla nella chat sbagliata, o il commercialista
lo inoltra, si collega un terzo qualsiasi — e l'utente **non se ne accorge**, perché non riceve
nessuna notifica.

Aggravanti misurate nel codice:

| Problema | Dove |
|---|---|
| Nessun limite ai token attivi per utente | `token_inviti`: nessun vincolo, `genera-token-invito` non controlla nulla |
| Validità 365 giorni | `CommercialistaManagementPage.js:49` → `generaTokenInvito(365)` |
| Token mostrato e ricopiabile all'infinito | `GET /utenti/token-inviti` restituisce il token in chiaro, sempre |
| Nessun binding al destinatario | `usa_token_invito(p_token, p_commercialista_id)` accetta qualunque commercialista |
| Nessuna notifica all'utente all'uso | nessun canale email nel backend (`nodemailer`: 0 occorrenze) |

Un token valido un anno, rigenerabile senza limite, visibile in chiaro a tempo indeterminato,
che apre tutto e non avvisa nessuno quando viene usato. Questo è il difetto strutturale del
workflow, non un dettaglio di implementazione.

### 2.2 Il consenso è implicito e non tracciato

L'utente decide di condividere **nel momento in cui genera il token**, non nel momento in cui
qualcuno si collega. Fra i due momenti possono passare 365 giorni. Non esiste da nessuna parte
un record che dica: *questo utente ha acconsentito a che questo commercialista vedesse questi dati,
il giorno X*. Per dati contabili di terzi è il minimo sindacale, ed è anche ciò che serve se
qualcuno contesta un accesso.

### 2.3 Nessun audit degli accessi

Il commercialista legge conti, IBAN, movimenti ed esporta l'intera contabilità in PDF. Non resta
traccia di **cosa** ha guardato e **quando** (`audit|accessi`: 0 occorrenze in `backend/routes/`).
Dopo una disconnessione non c'è modo di dire cosa sia stato visto o esportato.

### 2.4 L'accesso è tutto-o-niente

Collegamento = tutto lo storico, tutti i conti, tutti gli IBAN, tutte le anagrafiche. Un
commercialista che segue la dichiarazione 2025 vede anche i movimenti del conto personale del 2019.
Non c'è modo di limitare per periodo o per conto, e non c'è modo di dare accesso in sola
consultazione a un singolo export.

### 2.5 La disconnessione non chiude il cerchio

Unilaterale, silenziosa, senza data né motivo. L'altra parte se ne accorge solo trovando la
schermata vuota. Il collegamento resta a `attivo=FALSE` e viene riattivato da un `ON CONFLICT
DO UPDATE` se si ripresenta un token: la riattivazione è un effetto collaterale, non una decisione.

### 2.6 Lo stato è duplicato e va fuori sincrono

`utenti.commercialista_id` esiste (migration §4), viene scritto da `usa_token_invito` e azzerato
solo sul percorso utente. **Non è letto da nessuna query.** È una colonna che può solo
desincronizzarsi — già provato: dopo disconnessione lato commercialista, `attivo=f` ma
`commercialista_id=2`.

### 2.7 Multi-commercialista: lo schema lo permette, il codice no

`collegamenti_commercialista` è many-to-many con `UNIQUE(commercialista_id, user_id)`: un utente
può avere N commercialisti. Ma:
- `utenti.commercialista_id` è singolo;
- `GET /utenti/commercialista` fa `queryOne` senza `ORDER BY`/`LIMIT`;
- `messaggi.js:26` prende *un* collegamento attivo a caso.

Con due commercialisti collegati, la chat dell'utente finisce su quello sbagliato in modo non
deterministico. La roadmap chiede il multi-commercialista: oggi il codice lo rompe in silenzio.

### 2.8 Il workflow reale del mestiere non è coperto

Quello che un commercialista chiede davvero a un cliente è *"mandami la fattura"*, *"questo
movimento cos'è?"*, *"mancano i documenti di marzo"*. Oggi:
- chat **senza allegati** (`multer`/`upload`: 0 occorrenze in `messaggi.js`);
- nessun modo di puntare un messaggio a uno specifico movimento;
- nessuna richiesta di chiarimento tracciabile, con stato aperto/chiuso;
- nessuna notifica fuori dall'app: chi non tiene la scheda aperta non sa di avere un messaggio.

Il risultato è che la chat verrà bypassata e si tornerà a WhatsApp, e il portale resterà un
visualizzatore.

### 2.9 Nessun recupero password

Né utente né commercialista (`reset|forgot` in `auth.js`: 0 occorrenze). Un commercialista che
perde la password perde tutti i clienti collegati: non c'è nemmeno un endpoint per cambiarla
(`commercialisti.js` espone solo `register`, `login`, `profile` in lettura).

---

## 3. Il workflow proposto

### 3.1 Principio: invertire la direzione del consenso

Il consenso deve essere dato **quando l'accesso inizia**, non 365 giorni prima, e deve essere
un atto esplicito dell'utente su una controparte **identificata**.

```
COMMERCIALISTA                           UTENTE
  │
  │ POST /api/commercialisti/richieste
  │   { identificativo_cliente }         ← username o email del cliente
  │   → richiesta in stato `in_attesa`
  │                                       │
  │                                       │ vede la richiesta in app + notifica email
  │                                       │ con: ragione sociale, P.IVA, email del richiedente
  │                                       │
  │                                       │ PUT /api/utenti/richieste/:id
  │                                       │   { esito: 'accettata'|'rifiutata',
  │                                       │     ambito: { dal: '2025-01-01',
  │                                       │               conti: [1,3] } }
  │                                       │
  │ ✓ notifica esito                      │ ✓ il consenso è registrato qui, datato,
  │ ✓ accesso nei limiti dell'ambito      │   con l'ambito che l'utente ha scelto
```

Il token invito **resta**, come percorso alternativo per il caso "il mio commercialista non è
ancora registrato": ma diventa un token di **onboarding**, non di accesso — porta il
commercialista alla registrazione e apre una richiesta, che l'utente deve comunque accettare.

Effetto: chi ottiene il token non ottiene più i dati. Ottiene solo la possibilità di bussare.

### 3.2 Token invito: irrigidimento

| Regola | Oggi | Proposto |
|---|---|---|
| Validità | 365 gg | **7 gg**, max 30 |
| Token attivi per utente | illimitati | **1** (`UNIQUE` parziale su `user_id WHERE stato='attivo'`) |
| Memorizzazione | in chiaro | **hash SHA-256**; il valore si vede **una volta sola**, alla generazione |
| Uso | apre l'accesso | apre una **richiesta**, che va accettata |
| Revoca | `DELETE` fisico | `stato='revocato'`, record conservato |

L'hash è la differenza fra "un segreto è trapelato" e "un segreto è trapelato **e il database lo
conserva in chiaro a tempo indeterminato**".

### 3.3 Il collegamento diventa una macchina a stati esplicita

Oggi c'è un booleano `attivo`. Serve un `stato`:

```
             ┌──────────── rifiutata ─────────────┐
             │                                     ▼
  in_attesa ─┼──── accettata ──► attiva ──► revocata  (terminale)
             │                     │  ▲
             └── scaduta ──────────┘  │
                                   sospesa   (dall'utente, reversibile)
```

Con, su ogni transizione: **chi** l'ha fatta (`user` | `commercialista`), **quando**, ed
eventuale motivo. Serve tanto all'utente ("perché non vedo più i dati?") quanto a chiunque debba
ricostruire cosa è successo.

`sospesa` copre il caso reale che oggi manca: *"non voglio che veda nulla fino a che non ho
sistemato marzo"*, senza dover rompere il collegamento e rifare tutto il giro dell'invito.

### 3.4 Ambito di accesso

Sul collegamento, opzionali e impostati dall'utente in fase di accettazione:

- `ambito_dal` / `ambito_al` — finestra temporale sui movimenti;
- `conti_ammessi` — sottoinsieme di `conti_correnti`, vuoto = tutti.

Applicati **in un unico punto** (vedi 3.6), non ricopiati in ogni query.

### 3.5 Audit degli accessi

Una tabella `accessi_commercialista`: chi, quale collegamento, che tipo di accesso
(`lista_clienti` | `dettaglio_cliente` | `export` | `chat`), quando, e per gli export il formato,
i filtri e il numero di record. Scritta da un middleware, non a mano in ogni route.

Ricaduta diretta sull'utente: una sezione *"cosa ha visto il mio commercialista"*, che è la cosa
che rende il collegamento accettabile a chi è diffidente nel dare i propri conti a un portale web.

### 3.6 Un solo punto di controllo accesso

Tutte le route del commercialista che toccano dati del cliente devono passare da **un** middleware:

```js
// middleware/collegamento.js
// Risolve il collegamento attivo (commercialista → cliente), verifica lo stato,
// popola req.collegamento e req.ambito, scrive l'audit. Fail-closed.
requireCollegamento(tipoAccesso)
```

Oggi il controllo è copiato a mano in `GET /clienti/:userId` e in `POST /clienti/:userId/export`,
ed è **assente** in `DELETE /clienti/:userId` (che si affida alla funzione SQL) — è esattamente il
modo in cui, alla prossima route aggiunta, qualcuno si dimentica di copiarlo.

### 3.7 Notifiche fuori dall'app

Tabella `notifiche` (outbox) + un `NotificationService` con un solo `send()` e un adapter SMTP.
Eventi minimi: richiesta ricevuta, richiesta accettata/rifiutata, collegamento revocato,
messaggio non letto da più di N ore.

Senza questo, il polling a 10/15 secondi resta l'unico meccanismo di consegna — con il costo già
misurato (≈150 richieste per 15 minuti per scheda aperta, contro un limite di produzione di 300).

### 3.8 La chat diventa uno strumento di lavoro

- **Allegati** (`multer`, limite dimensione, whitelist MIME, storage fuori dal DB);
- **riferimento opzionale a un movimento** (`movimento_id` nullable sul messaggio) → dalla chat si
  salta al movimento e viceversa;
- **richieste di chiarimento** con stato `aperta`/`risolta`, così che "mancano i documenti di marzo"
  non si perda dopo venti messaggi.

### 3.9 Pulizia

- **Eliminare `utenti.commercialista_id`.** Unica fonte di verità: `collegamenti_commercialista`.
- `GET /utenti/commercialista` → `GET /utenti/collegamenti`, restituisce una **lista**.
- Chat lato utente: `collegamento_id` esplicito, mai "il primo attivo che trovo".
- Password: `PUT /commercialisti/password`, `PUT /commercialisti/profile`, e reset via token email
  per entrambi i tipi di account.

---

## 4. Impatto sullo schema

Nuova migration `002_workflow_collegamento.sql`, con `003_..._down.sql` di rollback testato.

```sql
-- collegamenti_commercialista
ALTER TABLE collegamenti_commercialista
  ADD COLUMN stato VARCHAR(20) NOT NULL DEFAULT 'attiva'
    CHECK (stato IN ('in_attesa','attiva','sospesa','rifiutata','revocata','scaduta')),
  ADD COLUMN richiesto_da VARCHAR(20) CHECK (richiesto_da IN ('user','commercialista')),
  ADD COLUMN data_richiesta   TIMESTAMP,
  ADD COLUMN data_accettazione TIMESTAMP,
  ADD COLUMN data_revoca      TIMESTAMP,
  ADD COLUMN revocato_da      VARCHAR(20) CHECK (revocato_da IN ('user','commercialista')),
  ADD COLUMN motivo_revoca    TEXT,
  ADD COLUMN ambito_dal  DATE,
  ADD COLUMN ambito_al   DATE,
  ADD COLUMN conti_ammessi INTEGER[];

-- migrazione dati: attivo=TRUE → 'attiva', attivo=FALSE → 'revocata'
-- `attivo` resta come colonna generata in sola lettura per un ciclo, poi si elimina.

-- token_inviti
ALTER TABLE token_inviti
  ADD COLUMN token_hash CHAR(64),
  ADD COLUMN stato VARCHAR(20) NOT NULL DEFAULT 'attivo'
    CHECK (stato IN ('attivo','usato','revocato','scaduto'));
CREATE UNIQUE INDEX idx_token_unico_attivo
  ON token_inviti(user_id) WHERE stato = 'attivo';
-- la colonna `token` in chiaro viene svuotata e poi rimossa.

-- nuove
CREATE TABLE accessi_commercialista (...);
CREATE TABLE notifiche (...);
ALTER TABLE messaggi_commercialista
  ADD COLUMN movimento_id INTEGER REFERENCES movimenti(id) ON DELETE SET NULL,
  ADD COLUMN allegato_path TEXT,
  ADD COLUMN allegato_nome VARCHAR(255),
  ADD COLUMN allegato_mime VARCHAR(100);

-- rimozione
ALTER TABLE utenti DROP COLUMN commercialista_id;
```

Vincolo di processo, oggi non rispettato: lo schema va replicato in `database/init.sql` **e** in
`helm-chart/templates/db-init-job.yaml`, altrimenti il deploy Helm produce un'app rotta.

---

## 5. Ordine di esecuzione proposto

Rispetta l'ordine ratificato dal titolare: **workflow → sistema → sicurezza → UX**.

| # | Blocco | Contenuto | Prova richiesta |
|---|---|---|---|
| W1 | Macchina a stati | migration 002 + rollback, `requireCollegamento`, rimozione `utenti.commercialista_id` | migration applicata e annullata su DB di prova; curl su ogni transizione |
| W2 | Invito irrigidito | hash, 1 token attivo, 7 gg, richiesta + accettazione | token riusato → rifiutato; secondo token → rifiutato; token in chiaro assente dal DB |
| W3 | Audit + ambito | `accessi_commercialista`, `ambito_*`, applicazione nel middleware | export fuori ambito → dati filtrati; riga di audit presente |
| W4 | Notifiche | outbox + SMTP, sostituzione parziale del polling | email in coda su ogni evento; conteggio richieste per sessione ridotto |
| W5 | Chat di lavoro | allegati, `movimento_id`, richieste di chiarimento | upload accettato/rifiutato per MIME e dimensione |
| W6 | Account | cambio password ed email, reset per entrambi i tipi | ciclo completo di reset via curl |

W1 e W2 sono il cuore: da soli chiudono i difetti 2.1, 2.2, 2.5, 2.6, 2.7.

Ogni blocco è un branch `feat/...` separato, con review `pn-gpt` prima della chiusura della card.

---

## 6. Cosa questa proposta **non** copre

- Fix di sicurezza su `backend/middleware/auth.js` (token commercialista accettato dalle route
  utente) — **fase 3**, ma va detto chiaramente: finché non è chiuso, nessuna parte di questo
  workflow è efficace, perché il controllo di accesso si aggira a monte.
- Rimozione del `console.log` che stampa la password in chiaro al login commercialista — fase 3.
- Allineamento `init.sql` / `db-init-job.yaml` e ripristino di `nginx.conf` deploy-neutral — fase 2.
- Ridisegno UX mobile-first — fase 4.
