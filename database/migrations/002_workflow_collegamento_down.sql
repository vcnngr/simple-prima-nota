-- Rollback della migration 002.
-- Riporta collegamenti_commercialista al booleano `attivo`, ripristina
-- utenti.commercialista_id e le firme originali delle funzioni.
-- Perdita di dati attesa: lo storico delle transizioni (chi/quando/perche')
-- e l'ambito di accesso non hanno posto nello schema 001.

BEGIN;

-- ==============================================================================
-- 1. utenti.commercialista_id
-- ==============================================================================
ALTER TABLE utenti
  ADD COLUMN IF NOT EXISTS commercialista_id INTEGER
    REFERENCES commercialisti(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_utenti_commercialista_id ON utenti(commercialista_id);

UPDATE utenti u
SET commercialista_id = c.commercialista_id
FROM collegamenti_commercialista c
WHERE c.user_id = u.id AND c.stato = 'attiva';

-- ==============================================================================
-- 2. collegamenti: da `stato` al booleano
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'collegamenti_commercialista'
      AND column_name = 'attivo'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE collegamenti_commercialista DROP COLUMN attivo;
    ALTER TABLE collegamenti_commercialista ADD COLUMN attivo BOOLEAN DEFAULT TRUE;
    UPDATE collegamenti_commercialista SET attivo = (stato = 'attiva');
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_collegamenti_updated_at ON collegamenti_commercialista;

ALTER TABLE collegamenti_commercialista
  DROP CONSTRAINT IF EXISTS chk_collegamenti_stato,
  DROP CONSTRAINT IF EXISTS chk_collegamenti_richiesto_da,
  DROP CONSTRAINT IF EXISTS chk_collegamenti_revocato_da,
  DROP CONSTRAINT IF EXISTS chk_collegamenti_ambito;

DROP INDEX IF EXISTS idx_collegamenti_stato;

ALTER TABLE collegamenti_commercialista
  DROP COLUMN IF EXISTS stato,
  DROP COLUMN IF EXISTS richiesto_da,
  DROP COLUMN IF EXISTS data_richiesta,
  DROP COLUMN IF EXISTS data_accettazione,
  DROP COLUMN IF EXISTS data_revoca,
  DROP COLUMN IF EXISTS revocato_da,
  DROP COLUMN IF EXISTS motivo_revoca,
  DROP COLUMN IF EXISTS ambito_dal,
  DROP COLUMN IF EXISTS ambito_al,
  DROP COLUMN IF EXISTS conti_ammessi,
  DROP COLUMN IF EXISTS updated_at;

-- ==============================================================================
-- 3. Funzioni: firme originali della migration 001
-- ==============================================================================
DROP FUNCTION IF EXISTS usa_token_invito(VARCHAR, INTEGER);
CREATE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id INTEGER;
    v_scadenza TIMESTAMP;
    v_usato BOOLEAN;
BEGIN
    SELECT user_id, scadenza, usato INTO v_user_id, v_scadenza, v_usato
    FROM token_inviti WHERE token = p_token;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Token non valido'; END IF;
    IF v_usato THEN RAISE EXCEPTION 'Token gia'' utilizzato'; END IF;
    IF v_scadenza < NOW() THEN RAISE EXCEPTION 'Token scaduto'; END IF;

    INSERT INTO collegamenti_commercialista (commercialista_id, user_id)
    VALUES (p_commercialista_id, v_user_id)
    ON CONFLICT (commercialista_id, user_id) DO UPDATE
    SET attivo = TRUE, data_collegamento = NOW();

    UPDATE utenti SET commercialista_id = p_commercialista_id WHERE id = v_user_id;

    UPDATE token_inviti
    SET usato = TRUE, commercialista_id = p_commercialista_id, data_utilizzo = NOW()
    WHERE token = p_token;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS disconnetti_cliente_commercialista(INTEGER, INTEGER, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS disconnetti_cliente_commercialista(INTEGER, INTEGER);
CREATE FUNCTION disconnetti_cliente_commercialista(
    p_commercialista_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE collegamenti_commercialista
    SET attivo = FALSE
    WHERE commercialista_id = p_commercialista_id
      AND user_id = p_user_id
      AND attivo = TRUE;

    IF FOUND THEN RETURN TRUE;
    ELSE RAISE EXCEPTION 'Collegamento non trovato o gia'' disattivato';
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS get_commercialista_clients_summary(INTEGER);
CREATE FUNCTION get_commercialista_clients_summary(p_commercialista_id INTEGER)
RETURNS TABLE (
    user_id INTEGER, username VARCHAR, email VARCHAR, saldo_totale DECIMAL,
    numero_conti INTEGER, numero_movimenti INTEGER,
    ultimo_movimento TIMESTAMP, ultima_modifica TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    WITH user_accounts AS (
        SELECT cc.user_id, cc.id as conto_id, cc.saldo_iniziale,
               cc.updated_at as conto_updated_at,
               COALESCE((SELECT SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END)
                         FROM movimenti m WHERE m.conto_id = cc.id), 0) as saldo_movimenti
        FROM collegamenti_commercialista col
        JOIN conti_correnti cc ON cc.user_id = col.user_id
        WHERE col.commercialista_id = p_commercialista_id
          AND col.attivo = TRUE AND cc.attivo = TRUE
    ),
    user_movements AS (
        SELECT cc.user_id, COUNT(m.id) as num_movimenti,
               MAX(m.data)::TIMESTAMP as ultimo_mov, MAX(m.created_at) as ultimo_movimento_created
        FROM collegamenti_commercialista col
        JOIN conti_correnti cc ON cc.user_id = col.user_id
        LEFT JOIN movimenti m ON m.conto_id = cc.id
        WHERE col.commercialista_id = p_commercialista_id
          AND col.attivo = TRUE AND cc.attivo = TRUE
        GROUP BY cc.user_id
    )
    SELECT u.id, u.username, u.email,
           COALESCE(SUM(ua.saldo_iniziale + ua.saldo_movimenti), 0) as saldo_totale,
           COUNT(DISTINCT ua.conto_id)::INTEGER as numero_conti,
           COALESCE(um.num_movimenti, 0)::INTEGER as numero_movimenti,
           um.ultimo_mov as ultimo_movimento,
           GREATEST(u.updated_at, COALESCE(MAX(ua.conto_updated_at), u.updated_at),
                    COALESCE(um.ultimo_movimento_created, u.updated_at)) as ultima_modifica
    FROM collegamenti_commercialista col
    JOIN utenti u ON u.id = col.user_id
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
    LEFT JOIN user_movements um ON um.user_id = u.id
    WHERE col.commercialista_id = p_commercialista_id AND col.attivo = TRUE
    GROUP BY u.id, u.username, u.email, u.updated_at, um.num_movimenti,
             um.ultimo_mov, um.ultimo_movimento_created;
END;
$$ LANGUAGE plpgsql;

COMMIT;
