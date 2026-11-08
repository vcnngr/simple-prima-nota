-- Dati dimostrativi (blocco D1): azzera il database della demo e lo riempie
-- con uno studio e dieci clienti inventati. Nessun dato reale.
--
--   psql -v ON_ERROR_STOP=1 -d prima_nota_demo -f database/demo/demo.sql
--
-- Gira SOLO su un database che si chiama prima_nota_demo: altrove si ferma
-- prima di toccare qualunque cosa (la produzione si chiama prima_nota).
-- Lo schema deve essere gia' aggiornato (database/migra.sh applica).
-- Le date sono relative a CURRENT_DATE: dodici mesi fino a oggi, a ogni giro.
-- Password di tutti gli account: prova2026 (solo demo).

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'prima_nota_demo' THEN
    RAISE EXCEPTION 'demo.sql: database "%", atteso "prima_nota_demo": nessun azzeramento', current_database();
  END IF;
END $$;

-- Allegati: DELETE (non TRUNCATE) perche' il trigger metta i file nella coda di
-- rimozione del backend (allegati_da_rimuovere): cosi' spariscono anche dal disco.
DELETE FROM allegati_messaggio;
TRUNCATE accessi_commercialista, messaggi_commercialista, collegamenti_commercialista,
         notifiche, token_account, token_inviti, alerts, movimenti, anagrafiche,
         tipologie_anagrafiche, categorie_anagrafiche, categorie_movimenti, conti_correnti,
         account_demo_bloccati, commercialisti, utenti
  RESTART IDENTITY CASCADE;

SELECT setseed(0.2026);

-- Clienti: username, nome attivita', email
CREATE TEMP TABLE d_clienti (n int PRIMARY KEY, username text, nome text) ON COMMIT DROP;
INSERT INTO d_clienti VALUES
  (1, 'bar.centrale',        'Bar Centrale snc'),
  (2, 'bb.lecorti',          'B&B Le Corti'),
  (3, 'idraulica.greco',     'Idraulica Greco di Marco Greco'),
  (4, 'dentista.lupo',       'Studio dentistico dott.ssa Lupo'),
  (5, 'ferramenta.conte',    'Ferramenta Conte srl'),
  (6, 'avv.marino',          'Avv. Elena Marino'),
  (7, 'panificio.russo',     'Panificio Russo'),
  (8, 'agriturismo.uliveto', 'Agriturismo L''Uliveto'),
  (9, 'grafica.ferri',       'Ferri Grafica'),
  (10, 'palestra.olimpo',    'Palestra Olimpo asd');

-- Conti: cliente, banca, saldo iniziale (dodici mesi fa)
CREATE TEMP TABLE d_conti (n int, banca text, iniziale numeric) ON COMMIT DROP;
INSERT INTO d_conti VALUES
  (1, 'BPER Banca', 8400), (1, 'Cassa', 650),
  (2, 'Fineco', 12500), (2, 'Intesa Sanpaolo', 9500), (2, 'Cassa', 400),
  (3, 'Intesa Sanpaolo', 6800), (3, 'Cassa', 300),
  (4, 'UniCredit', 21000),
  (5, 'BPER Banca', 15400), (5, 'UniCredit', 14800), (5, 'Cassa', 900),
  (6, 'Fineco', 9300),
  (7, 'BCC Terra d''Otranto', 5200), (7, 'Cassa', 750),
  (8, 'Intesa Sanpaolo', 18600), (8, 'Cassa', 500),
  (9, 'N26', 3900),
  (10, 'UniCredit', 7100), (10, 'Cassa', 350);

-- Modello dei movimenti: cliente, controparte, tipo, categoria, conto, importo
-- minimo e massimo, quanti al mese (0 = uno ogni tre mesi), giorno fisso (0 = a caso).
CREATE TEMP TABLE d_modello (n int, chi text, tipo text, categoria text, conto text,
  minimo numeric, massimo numeric, al_mese int, giorno int) ON COMMIT DROP;
INSERT INTO d_modello VALUES
  -- 1 Bar
  (1, 'Incassi giornalieri', 'Entrata', 'Incassi', 'Cassa', 380, 920, 8, 0),
  (1, 'Nexi - POS', 'Entrata', 'Incassi POS', 'BPER Banca', 900, 2600, 4, 0),
  (1, 'Caffè Quarta spa', 'Uscita', 'Materie prime', 'BPER Banca', 280, 640, 2, 0),
  (1, 'Metro Cash & Carry', 'Uscita', 'Materie prime', 'BPER Banca', 190, 780, 3, 0),
  (1, 'Birra Salento srl', 'Uscita', 'Materie prime', 'BPER Banca', 240, 520, 1, 0),
  (1, 'Immobiliare Duomo', 'Uscita', 'Affitto', 'BPER Banca', 1400, 1400, 1, 5),
  (1, 'Enel Energia', 'Uscita', 'Utenze', 'BPER Banca', 210, 480, 1, 18),
  (1, 'Acquedotto Pugliese', 'Uscita', 'Utenze', 'BPER Banca', 60, 140, 0, 22),
  (1, 'Anna De Santis', 'Uscita', 'Personale', 'BPER Banca', 1180, 1180, 1, 27),
  (1, 'Agenzia delle Entrate - F24', 'Uscita', 'Tasse e contributi', 'BPER Banca', 380, 1650, 1, 16),
  -- 2 B&B
  (2, 'Booking.com B.V.', 'Entrata', 'Affitti brevi', 'Fineco', 600, 2400, 3, 0),
  (2, 'Airbnb Payments', 'Entrata', 'Affitti brevi', 'Fineco', 300, 1300, 2, 0),
  (2, 'Ospiti diretti', 'Entrata', 'Affitti brevi', 'Cassa', 150, 420, 3, 0),
  (2, 'Booking.com B.V. - commissioni', 'Uscita', 'Commissioni', 'Fineco', 90, 380, 1, 6),
  (2, 'Lavanderia Il Bucato', 'Uscita', 'Pulizie e biancheria', 'Intesa Sanpaolo', 120, 260, 2, 0),
  (2, 'Pulizie Sole snc', 'Uscita', 'Pulizie e biancheria', 'Intesa Sanpaolo', 380, 620, 1, 3),
  (2, 'Enel Energia', 'Uscita', 'Utenze', 'Intesa Sanpaolo', 180, 420, 1, 15),
  (2, 'Fastweb', 'Uscita', 'Utenze', 'Intesa Sanpaolo', 34.95, 34.95, 1, 2),
  (2, 'Comune di Lecce - imposta di soggiorno', 'Uscita', 'Tasse e contributi', 'Intesa Sanpaolo', 90, 320, 1, 16),
  (2, 'Metro Cash & Carry', 'Uscita', 'Colazioni', 'Fineco', 110, 260, 2, 0),
  -- 3 Idraulico
  (3, 'Condominio Via Trinchese 12', 'Entrata', 'Lavori', 'Intesa Sanpaolo', 420, 2200, 1, 0),
  (3, 'Privati - interventi', 'Entrata', 'Lavori', 'Cassa', 80, 350, 4, 0),
  (3, 'Impresa Edile Martano srl', 'Entrata', 'Lavori', 'Intesa Sanpaolo', 1500, 4800, 0, 0),
  (3, 'Termoidraulica Salentina', 'Uscita', 'Materiali', 'Intesa Sanpaolo', 180, 950, 3, 0),
  (3, 'Q8 - carburante', 'Uscita', 'Automezzo', 'Intesa Sanpaolo', 60, 110, 3, 0),
  (3, 'Leasys - noleggio furgone', 'Uscita', 'Automezzo', 'Intesa Sanpaolo', 420, 420, 1, 10),
  (3, 'TIM', 'Uscita', 'Utenze', 'Intesa Sanpaolo', 29.90, 29.90, 1, 8),
  (3, 'INPS - contributi', 'Uscita', 'Tasse e contributi', 'Intesa Sanpaolo', 1120, 1120, 0, 16),
  -- 4 Dentista
  (4, 'Pazienti - prestazioni', 'Entrata', 'Prestazioni', 'UniCredit', 120, 950, 10, 0),
  (4, 'Fondo Sanitario Unisalute', 'Entrata', 'Convenzioni', 'UniCredit', 900, 3100, 1, 0),
  (4, 'Dentalmarket spa', 'Uscita', 'Materiali', 'UniCredit', 300, 1400, 2, 0),
  (4, 'Laboratorio Odontotecnico Pace', 'Uscita', 'Laboratorio', 'UniCredit', 600, 2200, 1, 0),
  (4, 'Giulia Rizzo - assistente', 'Uscita', 'Personale', 'UniCredit', 1450, 1450, 1, 27),
  (4, 'Immobiliare San Lazzaro', 'Uscita', 'Affitto', 'UniCredit', 1800, 1800, 1, 5),
  (4, 'Enel Energia', 'Uscita', 'Utenze', 'UniCredit', 150, 320, 1, 18),
  (4, 'ENPAM', 'Uscita', 'Tasse e contributi', 'UniCredit', 2300, 2300, 0, 30),
  -- 5 Ferramenta
  (5, 'Vendite al banco', 'Entrata', 'Vendite', 'Cassa', 300, 900, 8, 0),
  (5, 'SumUp - POS', 'Entrata', 'Vendite', 'BPER Banca', 800, 2400, 4, 0),
  (5, 'Edilcasa srl', 'Entrata', 'Vendite a imprese', 'UniCredit', 900, 3800, 1, 0),
  (5, 'Würth srl', 'Uscita', 'Merce', 'BPER Banca', 800, 3200, 2, 0),
  (5, 'Brico Distribuzione', 'Uscita', 'Merce', 'UniCredit', 600, 2400, 1, 0),
  (5, 'Mario Conte - affitto locale', 'Uscita', 'Affitto', 'BPER Banca', 1600, 1600, 1, 5),
  (5, 'Luca Pellegrino', 'Uscita', 'Personale', 'BPER Banca', 1320, 1320, 1, 27),
  (5, 'Enel Energia', 'Uscita', 'Utenze', 'UniCredit', 160, 380, 1, 18),
  (5, 'Agenzia delle Entrate - F24', 'Uscita', 'Tasse e contributi', 'UniCredit', 900, 2600, 1, 16),
  -- 6 Avvocata
  (6, 'Rossi Costruzioni spa', 'Entrata', 'Parcelle', 'Fineco', 1200, 4500, 0, 0),
  (6, 'Clienti privati', 'Entrata', 'Parcelle', 'Fineco', 300, 1500, 2, 0),
  (6, 'Assicurazioni Generali', 'Entrata', 'Parcelle', 'Fineco', 900, 2800, 0, 0),
  (6, 'Studio Associato Via Palmieri', 'Uscita', 'Affitto studio', 'Fineco', 650, 650, 1, 5),
  (6, 'Giuffrè Francis Lefebvre', 'Uscita', 'Banche dati', 'Fineco', 89, 89, 1, 12),
  (6, 'Cassa Forense', 'Uscita', 'Tasse e contributi', 'Fineco', 1250, 1250, 0, 30),
  (6, 'Ordine degli Avvocati di Lecce', 'Uscita', 'Tasse e contributi', 'Fineco', 260, 260, 0, 28),
  -- 7 Panificio
  (7, 'Vendite al banco', 'Entrata', 'Incassi', 'Cassa', 260, 720, 10, 0),
  (7, 'Supermercato Sigma', 'Entrata', 'Forniture', 'BCC Terra d''Otranto', 600, 1400, 2, 0),
  (7, 'Molino Casillo', 'Uscita', 'Farine', 'BCC Terra d''Otranto', 700, 1600, 2, 0),
  (7, 'Enel Energia', 'Uscita', 'Utenze', 'BCC Terra d''Otranto', 480, 980, 1, 18),
  (7, 'Pasquale Russo', 'Uscita', 'Personale', 'BCC Terra d''Otranto', 1250, 1250, 1, 27),
  (7, 'Agenzia delle Entrate - F24', 'Uscita', 'Tasse e contributi', 'BCC Terra d''Otranto', 300, 1200, 1, 16),
  -- 8 Agriturismo
  (8, 'Booking.com B.V.', 'Entrata', 'Ospitalità', 'Intesa Sanpaolo', 900, 3800, 2, 0),
  (8, 'Ristorante - incassi', 'Entrata', 'Ristorazione', 'Cassa', 300, 1100, 6, 0),
  (8, 'Frantoio De Carlo', 'Entrata', 'Vendita olio', 'Intesa Sanpaolo', 1200, 5200, 0, 0),
  (8, 'Consorzio Agrario', 'Uscita', 'Agricoltura', 'Intesa Sanpaolo', 300, 1500, 1, 0),
  (8, 'Ortofrutta Mancarella', 'Uscita', 'Ristorazione', 'Intesa Sanpaolo', 200, 700, 2, 0),
  (8, 'Stagionali - paghe', 'Uscita', 'Personale', 'Intesa Sanpaolo', 1800, 3400, 1, 27),
  (8, 'Enel Energia', 'Uscita', 'Utenze', 'Intesa Sanpaolo', 280, 690, 1, 18),
  (8, 'Agenzia delle Entrate - F24', 'Uscita', 'Tasse e contributi', 'Intesa Sanpaolo', 600, 2400, 1, 16),
  -- 9 Grafica
  (9, 'Agenzia Lumen', 'Entrata', 'Progetti', 'N26', 600, 2400, 1, 0),
  (9, 'Cantine Due Palme', 'Entrata', 'Progetti', 'N26', 900, 3000, 0, 0),
  (9, 'Clienti piccoli', 'Entrata', 'Progetti', 'N26', 150, 600, 1, 0),
  (9, 'Adobe Systems', 'Uscita', 'Software', 'N26', 66.42, 66.42, 1, 3),
  (9, 'Coworking Officine Cantelmo', 'Uscita', 'Affitto', 'N26', 180, 180, 1, 5),
  (9, 'INPS - gestione separata', 'Uscita', 'Tasse e contributi', 'N26', 640, 640, 0, 16),
  -- 10 Palestra
  (10, 'Quote associative', 'Entrata', 'Quote', 'UniCredit', 900, 2600, 3, 0),
  (10, 'Ingressi giornalieri', 'Entrata', 'Quote', 'Cassa', 60, 240, 6, 0),
  (10, 'Technogym spa - noleggio', 'Uscita', 'Attrezzature', 'UniCredit', 540, 540, 1, 10),
  (10, 'Istruttori - compensi', 'Uscita', 'Compensi sportivi', 'UniCredit', 900, 1600, 1, 28),
  (10, 'Immobiliare Olimpia', 'Uscita', 'Affitto', 'UniCredit', 1250, 1250, 1, 5),
  (10, 'Enel Energia', 'Uscita', 'Utenze', 'UniCredit', 260, 610, 1, 18);

-- Account. Password: prova2026 (crypt di pgcrypto, $2a$: bcryptjs la accetta).
INSERT INTO utenti (username, email, password_hash)
SELECT username, username || '@demo.prima-nota.invalid', crypt('prova2026', gen_salt('bf', 10))
FROM d_clienti ORDER BY n;

INSERT INTO commercialisti (username, email, password_hash, ragione_sociale, partita_iva, telefono)
VALUES ('studio', 'studio@demo.prima-nota.invalid', crypt('prova2026', gen_salt('bf', 10)),
        'Studio Bianchi Commercialisti Associati', '04512345678', '0832 000000');

CREATE TEMP TABLE d_id AS
SELECT c.n, u.id AS user_id, c.nome FROM d_clienti c JOIN utenti u USING (username);

INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id)
SELECT k.banca, i.nome, k.iniziale, i.user_id FROM d_conti k JOIN d_id i USING (n);

INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, colore, icona)
SELECT i.user_id, t.nome, t.tipo, t.colore, t.icona
FROM d_id i CROSS JOIN (VALUES ('Clienti', 'Entrata', '#15803D', 'user'),
                               ('Fornitori', 'Uscita', '#B91C1C', 'truck'),
                               ('Erario ed enti', 'Uscita', '#1D4ED8', 'landmark')) t(nome, tipo, colore, icona);

INSERT INTO anagrafiche (nome, tipologia_id, tipo_movimento_preferito, categoria, user_id)
SELECT DISTINCT ON (i.user_id, m.chi) m.chi,
       (SELECT id FROM tipologie_anagrafiche t WHERE t.user_id = i.user_id AND t.nome =
          CASE WHEN m.tipo = 'Entrata' THEN 'Clienti'
               WHEN m.categoria = 'Tasse e contributi' THEN 'Erario ed enti' ELSE 'Fornitori' END),
       m.tipo, m.categoria, i.user_id
FROM d_modello m JOIN d_id i USING (n)
ORDER BY i.user_id, m.chi;

INSERT INTO categorie_movimenti (user_id, nome, tipo)
SELECT i.user_id, m.categoria,
       CASE WHEN count(DISTINCT m.tipo) > 1 THEN 'Entrambi' ELSE min(m.tipo) END
FROM d_modello m JOIN d_id i USING (n) GROUP BY i.user_id, m.categoria;

-- Movimenti: dodici mesi fino a oggi.
INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, user_id)
SELECT x.data, a.id, cc.id, x.descrizione, m.categoria, x.importo, m.tipo, i.user_id
FROM d_modello m
JOIN d_id i USING (n)
JOIN anagrafiche a ON a.user_id = i.user_id AND a.nome = m.chi
JOIN conti_correnti cc ON cc.user_id = i.user_id AND cc.nome_banca = m.conto
CROSS JOIN generate_series(0, 11) AS g(mesi_fa)
CROSS JOIN LATERAL (
  SELECT (date_trunc('month', CURRENT_DATE) - make_interval(months => g.mesi_fa))::date AS inizio
) p
CROSS JOIN LATERAL generate_series(1, greatest(m.al_mese, 1)) AS r(k)
CROSS JOIN LATERAL (
  -- r.k nella sottoquery: senza, PostgreSQL la calcola una volta sola per mese
  -- e le k righe del mese escono identiche.
  SELECT y.data, y.importo,
         CASE WHEN m.giorno > 0
              THEN m.categoria || ' ' || (ARRAY['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
                     'agosto','settembre','ottobre','novembre','dicembre'])[extract(month FROM p.inizio)::int]
                     || ' ' || extract(year FROM p.inizio)
              ELSE m.categoria || ' del ' || to_char(y.data, 'DD/MM') END AS descrizione
  FROM (SELECT LEAST(p.inizio + (CASE WHEN m.giorno > 0 THEN m.giorno - 1
                                      ELSE floor(random() * 28)::int + 0 * r.k END),
                     (p.inizio + interval '1 month - 1 day')::date) AS data,
               round((m.minimo + random() * (m.massimo - m.minimo) + 0 * r.k)::numeric, 2) AS importo) y
) x
WHERE (m.al_mese > 0 OR g.mesi_fa % 3 = 0)
  AND x.data <= CURRENT_DATE;

-- Contanti versati in banca a fine mese (giroconto, senza controparte): l'85%
-- di quanto la cassa ha incassato al netto nel mese. Mese in corso escluso.
CREATE TEMP TABLE d_versa (n int, banca text) ON COMMIT DROP;
INSERT INTO d_versa VALUES (1, 'BPER Banca'), (2, 'Intesa Sanpaolo'), (3, 'Intesa Sanpaolo'),
  (5, 'UniCredit'), (7, 'BCC Terra d''Otranto'), (8, 'Intesa Sanpaolo'), (10, 'UniCredit');
CREATE TEMP TABLE d_versamenti AS
SELECT i.user_id, cassa.id AS da, banca.id AS a,
       (date_trunc('month', m.data) + interval '1 month - 1 day')::date AS giorno,
       round(0.85 * sum(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), -1) AS importo
FROM d_versa v JOIN d_id i USING (n)
JOIN conti_correnti cassa ON cassa.user_id = i.user_id AND cassa.nome_banca = 'Cassa'
JOIN conti_correnti banca ON banca.user_id = i.user_id AND banca.nome_banca = v.banca
JOIN movimenti m ON m.conto_id = cassa.id AND m.data < date_trunc('month', CURRENT_DATE)
GROUP BY 1, 2, 3, 4;
INSERT INTO movimenti (data, conto_id, descrizione, categoria, importo, tipo, user_id)
SELECT giorno, da, 'Versamento contanti in banca', 'Giroconto', importo, 'Uscita', user_id FROM d_versamenti WHERE importo > 0
UNION ALL
SELECT giorno, a, 'Versamento contanti dalla cassa', 'Giroconto', importo, 'Entrata', user_id FROM d_versamenti WHERE importo > 0;
INSERT INTO categorie_movimenti (user_id, nome, tipo)
SELECT DISTINCT user_id, 'Giroconto', 'Entrambi' FROM d_versamenti;

-- Studio e collegamenti: 1-8 attivi, 9 in attesa (lo studio ha chiesto, il
-- cliente deve accettare), 10 non collegato (prova del codice d'invito).
INSERT INTO collegamenti_commercialista (commercialista_id, user_id, stato, richiesto_da,
  data_richiesta, data_accettazione, data_collegamento)
SELECT (SELECT id FROM commercialisti WHERE username = 'studio'), i.user_id,
       CASE WHEN i.n <= 8 THEN 'attiva' ELSE 'in_attesa' END, 'commercialista',
       now() - interval '200 days', CASE WHEN i.n <= 8 THEN now() - interval '199 days' END,
       now() - interval '200 days'
FROM d_id i WHERE i.n <= 9;

-- Chiarimenti e chat: richieste aperte dello studio su movimenti veri,
-- qualche risposta del cliente non ancora letta dallo studio, una risolta.
CREATE TEMP TABLE d_mov AS
SELECT i.n, m.id, m.importo, a.nome, row_number() OVER (PARTITION BY i.n ORDER BY m.importo DESC, m.id) AS r
FROM movimenti m JOIN d_id i ON i.user_id = m.user_id JOIN anagrafiche a ON a.id = m.anagrafica_id
WHERE m.tipo = 'Uscita' AND m.data >= CURRENT_DATE - 45;

INSERT INTO messaggi_commercialista (collegamento_id, mittente_tipo, mittente_id, messaggio, letto,
  movimento_id, chiarimento_stato, chiarimento_risolto_at, chiarimento_risolto_da, created_at)
SELECT cl.id, x.mitt,
       CASE WHEN x.mitt = 'commercialista' THEN cl.commercialista_id ELSE cl.user_id END,
       x.testo, x.letto, x.mov, x.stato, x.risolto_at, x.risolto_da, now() - x.fa
FROM collegamenti_commercialista cl
JOIN d_id i ON i.user_id = cl.user_id
CROSS JOIN LATERAL (VALUES
  -- Bar: richiesta aperta con risposta del cliente da leggere
  (1, 'commercialista', 'Buongiorno, questo pagamento a ' || (SELECT nome FROM d_mov WHERE n = 1 AND r = 1) || ' ha fattura? Non la trovo nel cassetto fiscale.', true,
      (SELECT id FROM d_mov WHERE n = 1 AND r = 1), 'aperta', NULL::timestamp, NULL::text, interval '3 days'),
  (1, 'user', 'Sì, ve la mando oggi pomeriggio. Era una fornitura straordinaria per la festa patronale.', false,
      (SELECT id FROM d_mov WHERE n = 1 AND r = 1), NULL::text, NULL::timestamp, NULL::text, interval '2 days'),
  -- B&B: due richieste aperte, una risolta
  (2, 'commercialista', 'Ci serve il dettaglio delle commissioni di questo mese per la dichiarazione IVA.', true,
      (SELECT id FROM d_mov WHERE n = 2 AND r = 1), 'aperta', NULL, NULL, interval '5 days'),
  (2, 'commercialista', 'Questa uscita è personale o dell''attività?', true,
      (SELECT id FROM d_mov WHERE n = 2 AND r = 2), 'aperta', NULL, NULL, interval '4 days'),
  (2, 'commercialista', 'Ricevuta della lavanderia arrivata, grazie.', true,
      (SELECT id FROM d_mov WHERE n = 2 AND r = 3), 'risolta', now() - interval '6 days', 'commercialista', interval '9 days'),
  -- Ferramenta: messaggio del cliente non letto
  (5, 'user', 'Buongiorno, a fine mese arriva un rimborso da Würth: lo registro come entrata?', false,
      NULL, NULL, NULL, NULL, interval '1 day'),
  (5, 'commercialista', 'Questo importo è più alto del solito: è un ordine per il magazzino?', true,
      (SELECT id FROM d_mov WHERE n = 5 AND r = 1), 'aperta', NULL, NULL, interval '6 days'),
  -- Dentista: conversazione chiusa
  (4, 'commercialista', 'Promemoria: entro il 16 il versamento ENPAM.', true, NULL, NULL, NULL, NULL, interval '12 days'),
  (4, 'user', 'Fatto, grazie!', true, NULL, NULL, NULL, NULL, interval '11 days')
) AS x(n, mitt, testo, letto, mov, stato, risolto_at, risolto_da, fa)
WHERE x.n = i.n AND cl.stato = 'attiva' AND (x.mov IS NOT NULL OR x.stato IS NULL);

-- Le notifiche dei collegamenti appena creati non servono (posta spenta).
TRUNCATE notifiche RESTART IDENTITY;

COMMIT;

SELECT 'demo pronta: ' || (SELECT count(*) FROM utenti) || ' clienti, '
       || (SELECT count(*) FROM movimenti) || ' movimenti, '
       || (SELECT count(*) FROM messaggi_commercialista) || ' messaggi' AS esito;
