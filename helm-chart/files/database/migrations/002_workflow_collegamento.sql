-- Migration 002: Workflow collegamento utente <-> commercialista
-- Sostituisce il booleano `attivo` con una macchina a stati esplicita, registra
-- chi ha richiesto/accettato/revocato il collegamento e quando, introduce
-- l'ambito di accesso e rimuove la fonte di verita' duplicata utenti.commercialista_id.
--
-- Rollback: 002_workflow_collegamento_down.sql
-- Idempotente: si puo' applicare piu' volte senza errori.

BEGIN;

-- ==============================================================================
-- 1. COLLEGAMENTI: macchina a stati
-- ==============================================================================

ALTER TABLE collegamenti_commercialista
  ADD COLUMN IF NOT EXISTS stato             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS richiesto_da      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS data_richiesta    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS data_accettazione TIMESTAMP,
  ADD COLUMN IF NOT EXISTS data_revoca       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS revocato_da       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS motivo_revoca     TEXT,
  ADD COLUMN IF NOT EXISTS ambito_dal        DATE,
  ADD COLUMN IF NOT EXISTS ambito_al         DATE,
  ADD COLUMN IF NOT EXISTS conti_ammessi     INTEGER[],
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Migrazione dati dal booleano, solo per le righe non ancora convertite.
-- attivo = TRUE  -> 'attiva'   (collegamento in essere)
-- attivo = FALSE -> 'revocata' (collegamento chiuso; terminale)
UPDATE collegamenti_commercialista
SET stato = CASE WHEN attivo THEN 'attiva' ELSE 'revocata' END,
    richiesto_da = COALESCE(richiesto_da, 'commercialista'),
    data_richiesta = COALESCE(data_richiesta, data_collegamento),
    data_accettazione = COALESCE(data_accettazione, CASE WHEN attivo THEN data_collegamento END),
    data_revoca = COALESCE(data_revoca, CASE WHEN NOT attivo THEN data_collegamento END)
WHERE stato IS NULL;

ALTER TABLE collegamenti_commercialista
  ALTER COLUMN stato SET DEFAULT 'in_attesa',
  ALTER COLUMN stato SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_collegamenti_stato') THEN
    ALTER TABLE collegamenti_commercialista
      ADD CONSTRAINT chk_collegamenti_stato CHECK (
        stato IN ('in_attesa','attiva','sospesa','rifiutata','revocata','scaduta')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_collegamenti_richiesto_da') THEN
    ALTER TABLE collegamenti_commercialista
      ADD CONSTRAINT chk_collegamenti_richiesto_da CHECK (
        richiesto_da IS NULL OR richiesto_da IN ('user','commercialista')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_collegamenti_revocato_da') THEN
    ALTER TABLE collegamenti_commercialista
      ADD CONSTRAINT chk_collegamenti_revocato_da CHECK (
        revocato_da IS NULL OR revocato_da IN ('user','commercialista')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_collegamenti_ambito') THEN
    ALTER TABLE collegamenti_commercialista
      ADD CONSTRAINT chk_collegamenti_ambito CHECK (
        ambito_dal IS NULL OR ambito_al IS NULL OR ambito_dal <= ambito_al
      );
  END IF;
END $$;

-- `attivo` diventa una colonna generata in sola lettura: le query esistenti che
-- leggono `attivo = TRUE` continuano a funzionare, quelle che ci scrivono sopra
-- falliscono in modo rumoroso invece di corrompere lo stato in silenzio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'collegamenti_commercialista'
      AND column_name = 'attivo'
      AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE collegamenti_commercialista DROP COLUMN attivo;
    ALTER TABLE collegamenti_commercialista
      ADD COLUMN attivo BOOLEAN GENERATED ALWAYS AS (stato = 'attiva') STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collegamenti_stato ON collegamenti_commercialista(stato);

-- Un solo collegamento NON TERMINALE per coppia (commercialista, cliente).
--
-- La UNIQUE(commercialista_id, user_id) originale costringeva a riusare la stessa
-- riga per sempre: un token nuovo riportava a `in_attesa` anche un collegamento
-- gia' revocato, cancellando uno stato terminale. Al suo posto un indice unico
-- parziale sui soli stati aperti: le righe chiuse restano come storico e un nuovo
-- ciclo di collaborazione nasce come riga nuova.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'collegamenti_commercialista'
    AND con.contype = 'u'
    AND (SELECT array_agg(att.attname::text ORDER BY att.attname::text)
         FROM unnest(con.conkey) k
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k)
        = ARRAY['commercialista_id','user_id'];
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE collegamenti_commercialista DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collegamenti_aperto_unico
  ON collegamenti_commercialista (commercialista_id, user_id)
  WHERE stato IN ('in_attesa','attiva','sospesa');

DROP TRIGGER IF EXISTS trigger_collegamenti_updated_at ON collegamenti_commercialista;
CREATE TRIGGER trigger_collegamenti_updated_at
  BEFORE UPDATE ON collegamenti_commercialista
  FOR EACH ROW
  EXECUTE FUNCTION update_commercialista_updated_at();

-- ==============================================================================
-- 2. FUNZIONI SQL allineate alla macchina a stati
-- ==============================================================================

-- usa_token_invito: apre una RICHIESTA in attesa, non un accesso.
-- Il tipo di ritorno cambia (BOOLEAN -> INTEGER): serve DROP, non CREATE OR REPLACE.
--
-- Due invarianti che la prima versione non garantiva:
--  1. il token si consuma in modo ATOMICO (UPDATE ... WHERE usato = FALSE), quindi
--     due commercialisti che lo presentano nello stesso istante non aprono due
--     richieste: il secondo trova zero righe e riceve "Token gia' utilizzato";
--  2. un collegamento in stato TERMINALE non viene riaperto dal token: si crea una
--     riga nuova, e lo storico della collaborazione precedente resta intatto.
DROP FUNCTION IF EXISTS usa_token_invito(VARCHAR, INTEGER);
CREATE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_user_id INTEGER;
    v_collegamento_id INTEGER;
    v_stato VARCHAR(20);
BEGIN
    -- Consumo atomico: il primo che arriva blocca la riga, il secondo non la trova
    -- piu' libera. Nessuna finestra fra la lettura di `usato` e la sua scrittura.
    UPDATE token_inviti
    SET usato = TRUE,
        commercialista_id = p_commercialista_id,
        data_utilizzo = NOW()
    WHERE token = p_token
      AND usato = FALSE
      AND scadenza >= NOW()
    RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        -- Nessuna riga consumata: distinguo il motivo per l'utente finale.
        SELECT usato INTO v_stato FROM token_inviti WHERE token = p_token;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Token non valido';
        END IF;
        IF EXISTS (SELECT 1 FROM token_inviti WHERE token = p_token AND usato = TRUE) THEN
            RAISE EXCEPTION 'Token gia'' utilizzato';
        END IF;
        RAISE EXCEPTION 'Token scaduto';
    END IF;

    -- Se esiste gia' un collegamento APERTO con questo commercialista lo si riusa
    -- senza toccarne lo stato: il token non promuove e non retrocede nulla.
    SELECT id, stato INTO v_collegamento_id, v_stato
    FROM collegamenti_commercialista
    WHERE commercialista_id = p_commercialista_id
      AND user_id = v_user_id
      AND stato IN ('in_attesa','attiva','sospesa')
    FOR UPDATE;

    IF v_collegamento_id IS NOT NULL THEN
        RETURN v_collegamento_id;
    END IF;

    -- Nessun collegamento aperto: nasce una richiesta nuova. Le righe terminali
    -- (revocata / rifiutata / scaduta) restano dove sono, come storico.
    INSERT INTO collegamenti_commercialista
        (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
    VALUES
        (p_commercialista_id, v_user_id, 'in_attesa', 'commercialista', NOW())
    RETURNING id INTO v_collegamento_id;

    RETURN v_collegamento_id;
END;
$$ LANGUAGE plpgsql;

-- disconnetti_cliente_commercialista: revoca esplicita, con autore e motivo.
DROP FUNCTION IF EXISTS disconnetti_cliente_commercialista(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS disconnetti_cliente_commercialista(INTEGER, INTEGER, VARCHAR, TEXT);
CREATE FUNCTION disconnetti_cliente_commercialista(
    p_commercialista_id INTEGER,
    p_user_id INTEGER,
    p_revocato_da VARCHAR DEFAULT 'commercialista',
    p_motivo TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE collegamenti_commercialista
    SET stato = 'revocata',
        data_revoca = NOW(),
        revocato_da = p_revocato_da,
        motivo_revoca = p_motivo
    WHERE commercialista_id = p_commercialista_id
      AND user_id = p_user_id
      AND stato IN ('in_attesa','attiva','sospesa');

    IF FOUND THEN
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Collegamento non trovato o gia'' chiuso';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- La vecchia firma a 2 argomenti resta risolvibile grazie ai DEFAULT.

-- get_commercialista_clients_summary: filtra su stato invece che su attivo,
-- e restituisce il collegamento (serve al frontend per chat e ambito).
--
-- Due regole che la prima versione violava:
--  1. un collegamento SOSPESO compare ancora nell'elenco (il commercialista deve
--     capire perche' non vede piu' nulla) ma NON espone alcun dato contabile:
--     niente email, niente saldo, niente conteggi, niente date di movimento;
--  2. quando il collegamento e' attivo, i totali rispettano l'AMBITO accettato
--     dal cliente: solo i conti ammessi e solo la finestra temporale concordata.
DROP FUNCTION IF EXISTS get_commercialista_clients_summary(INTEGER);
CREATE FUNCTION get_commercialista_clients_summary(p_commercialista_id INTEGER)
RETURNS TABLE (
    user_id INTEGER,
    username VARCHAR,
    email VARCHAR,
    collegamento_id INTEGER,
    stato VARCHAR,
    saldo_totale DECIMAL,
    numero_conti INTEGER,
    numero_movimenti INTEGER,
    ultimo_movimento TIMESTAMP,
    ultima_modifica TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    WITH collegamenti AS (
        SELECT col.id, col.user_id, col.stato,
               col.ambito_dal, col.ambito_al, col.conti_ammessi
        FROM collegamenti_commercialista col
        WHERE col.commercialista_id = p_commercialista_id
          AND col.stato IN ('attiva','sospesa')
    ),
    -- Solo i collegamenti attivi producono dati. La sospensione non filtra le
    -- colonne a valle: toglie proprio le righe dalla sorgente degli aggregati.
    attivi AS (
        SELECT * FROM collegamenti c WHERE c.stato = 'attiva'
    ),
    conti_ammessi_cte AS (
        SELECT
            a.id AS collegamento_id,
            a.user_id,
            a.ambito_dal,
            a.ambito_al,
            cc.id AS conto_id,
            cc.saldo_iniziale,
            cc.updated_at AS conto_updated_at
        FROM attivi a
        JOIN conti_correnti cc ON cc.user_id = a.user_id
        WHERE cc.attivo = TRUE
          AND (a.conti_ammessi IS NULL OR cc.id = ANY(a.conti_ammessi))
    ),
    movimenti_ammessi AS (
        SELECT
            ca.collegamento_id,
            ca.conto_id,
            m.id AS movimento_id,
            m.tipo,
            m.importo,
            m.data,
            m.created_at
        FROM conti_ammessi_cte ca
        JOIN movimenti m ON m.conto_id = ca.conto_id
        WHERE (ca.ambito_dal IS NULL OR m.data >= ca.ambito_dal)
          AND (ca.ambito_al  IS NULL OR m.data <= ca.ambito_al)
    ),
    saldi AS (
        SELECT
            ca.collegamento_id,
            SUM(ca.saldo_iniziale) AS saldo_iniziale_totale,
            COUNT(DISTINCT ca.conto_id)::INTEGER AS numero_conti,
            MAX(ca.conto_updated_at) AS conto_updated_at
        FROM conti_ammessi_cte ca
        GROUP BY ca.collegamento_id
    ),
    aggregati AS (
        SELECT
            ma.collegamento_id,
            COALESCE(SUM(CASE WHEN ma.tipo = 'Entrata' THEN ma.importo ELSE -ma.importo END), 0) AS saldo_movimenti,
            COUNT(ma.movimento_id)::INTEGER AS numero_movimenti,
            MAX(ma.data)::TIMESTAMP AS ultimo_movimento,
            MAX(ma.created_at) AS ultimo_movimento_created
        FROM movimenti_ammessi ma
        GROUP BY ma.collegamento_id
    )
    SELECT
        u.id,
        u.username,
        CASE WHEN c.stato = 'attiva' THEN u.email ELSE NULL END::VARCHAR,
        c.id,
        c.stato,
        CASE WHEN c.stato = 'attiva'
             THEN COALESCE(s.saldo_iniziale_totale, 0) + COALESCE(ag.saldo_movimenti, 0)
             ELSE NULL END::DECIMAL,
        CASE WHEN c.stato = 'attiva' THEN COALESCE(s.numero_conti, 0) ELSE NULL END::INTEGER,
        CASE WHEN c.stato = 'attiva' THEN COALESCE(ag.numero_movimenti, 0) ELSE NULL END::INTEGER,
        CASE WHEN c.stato = 'attiva' THEN ag.ultimo_movimento ELSE NULL END,
        CASE WHEN c.stato = 'attiva'
             THEN GREATEST(u.updated_at,
                           COALESCE(s.conto_updated_at, u.updated_at),
                           COALESCE(ag.ultimo_movimento_created, u.updated_at))
             ELSE NULL END
    FROM collegamenti c
    JOIN utenti u ON u.id = c.user_id
    LEFT JOIN saldi s     ON s.collegamento_id  = c.id
    LEFT JOIN aggregati ag ON ag.collegamento_id = c.id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. RIMOZIONE DELLA FONTE DI VERITA' DUPLICATA
-- ==============================================================================
-- utenti.commercialista_id veniva scritta ma mai letta, e restava fuori sincrono
-- dopo una disconnessione lato commercialista.
DROP INDEX IF EXISTS idx_utenti_commercialista_id;
ALTER TABLE utenti DROP COLUMN IF EXISTS commercialista_id;

COMMIT;
