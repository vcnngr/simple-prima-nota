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

-- Un solo collegamento non terminale per coppia (commercialista, cliente).
-- La UNIQUE(commercialista_id, user_id) originale resta e resta sufficiente,
-- ma serve anche poter rifare una richiesta dopo un rifiuto: si riusa la riga.

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
DROP FUNCTION IF EXISTS usa_token_invito(VARCHAR, INTEGER);
CREATE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_user_id INTEGER;
    v_scadenza TIMESTAMP;
    v_usato BOOLEAN;
    v_collegamento_id INTEGER;
BEGIN
    SELECT user_id, scadenza, usato
    INTO v_user_id, v_scadenza, v_usato
    FROM token_inviti
    WHERE token = p_token;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Token non valido';
    END IF;
    IF v_usato THEN
        RAISE EXCEPTION 'Token gia'' utilizzato';
    END IF;
    IF v_scadenza < NOW() THEN
        RAISE EXCEPTION 'Token scaduto';
    END IF;

    INSERT INTO collegamenti_commercialista
        (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
    VALUES
        (p_commercialista_id, v_user_id, 'in_attesa', 'commercialista', NOW())
    ON CONFLICT (commercialista_id, user_id) DO UPDATE
    SET stato = CASE
            -- un collegamento gia' attivo o sospeso non viene resettato da un token
            WHEN collegamenti_commercialista.stato IN ('attiva','sospesa') THEN collegamenti_commercialista.stato
            ELSE 'in_attesa'
        END,
        richiesto_da = 'commercialista',
        data_richiesta = NOW(),
        data_revoca = NULL,
        revocato_da = NULL,
        motivo_revoca = NULL
    RETURNING id INTO v_collegamento_id;

    UPDATE token_inviti
    SET usato = TRUE,
        commercialista_id = p_commercialista_id,
        data_utilizzo = NOW()
    WHERE token = p_token;

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
        SELECT col.id, col.user_id, col.stato
        FROM collegamenti_commercialista col
        WHERE col.commercialista_id = p_commercialista_id
          AND col.stato IN ('attiva','sospesa')
    ),
    user_accounts AS (
        SELECT
            cc.user_id,
            cc.id AS conto_id,
            cc.saldo_iniziale,
            cc.updated_at AS conto_updated_at,
            COALESCE((
                SELECT SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END)
                FROM movimenti m WHERE m.conto_id = cc.id
            ), 0) AS saldo_movimenti
        FROM collegamenti c
        JOIN conti_correnti cc ON cc.user_id = c.user_id
        WHERE cc.attivo = TRUE
    ),
    user_movements AS (
        SELECT
            cc.user_id,
            COUNT(m.id) AS num_movimenti,
            MAX(m.data)::TIMESTAMP AS ultimo_mov,
            MAX(m.created_at) AS ultimo_movimento_created
        FROM collegamenti c
        JOIN conti_correnti cc ON cc.user_id = c.user_id
        LEFT JOIN movimenti m ON m.conto_id = cc.id
        WHERE cc.attivo = TRUE
        GROUP BY cc.user_id
    )
    SELECT
        u.id,
        u.username,
        u.email,
        c.id,
        c.stato,
        COALESCE(SUM(ua.saldo_iniziale + ua.saldo_movimenti), 0) AS saldo_totale,
        COUNT(DISTINCT ua.conto_id)::INTEGER AS numero_conti,
        COALESCE(um.num_movimenti, 0)::INTEGER AS numero_movimenti,
        um.ultimo_mov AS ultimo_movimento,
        GREATEST(
            u.updated_at,
            COALESCE(MAX(ua.conto_updated_at), u.updated_at),
            COALESCE(um.ultimo_movimento_created, u.updated_at)
        ) AS ultima_modifica
    FROM collegamenti c
    JOIN utenti u ON u.id = c.user_id
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
    LEFT JOIN user_movements um ON um.user_id = u.id
    GROUP BY u.id, u.username, u.email, c.id, c.stato, u.updated_at,
             um.num_movimenti, um.ultimo_mov, um.ultimo_movimento_created;
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
