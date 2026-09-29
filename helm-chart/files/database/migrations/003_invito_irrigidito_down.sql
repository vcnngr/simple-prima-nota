-- Rollback della migration 003.
-- Riporta token_inviti alla forma della 001 (valore in chiaro + booleano `usato`)
-- e ripristina le funzioni come le lasciava la 002.
--
-- PERDITA DICHIARATA: i token in chiaro non sono ricostruibili — e' esattamente
-- cio' che la 003 rende impossibile. Le righe preesistenti vengono riportate con
-- un segnaposto e marcate come usate, quindi inservibili: dopo il rollback gli
-- utenti devono rigenerare l'invito. Nessun collegamento e nessun dato contabile
-- viene toccato.
--
-- Idempotente: si puo' applicare piu' volte senza errori.

BEGIN;

-- ==============================================================================
-- 1. Funzioni introdotte dalla 003
-- ==============================================================================
DROP FUNCTION IF EXISTS richiedi_collegamento(INTEGER, VARCHAR);
DROP FUNCTION IF EXISTS richiedi_collegamento_interno(INTEGER, INTEGER);

-- ==============================================================================
-- 2. token_inviti: dal `stato` al booleano `usato`
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_inviti' AND column_name = 'usato' AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE token_inviti DROP COLUMN usato;
    ALTER TABLE token_inviti ADD COLUMN usato BOOLEAN DEFAULT FALSE;
    UPDATE token_inviti SET usato = (stato <> 'attivo');
  END IF;
END $$;

-- Ripristino della colonna in chiaro. Il valore originale non esiste piu':
-- si mette un segnaposto unico e si marca la riga come usata, cosi' nessun
-- token vecchio risulta spendibile dopo il rollback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_inviti' AND column_name = 'token'
  ) THEN
    ALTER TABLE token_inviti ADD COLUMN token VARCHAR(64);
    UPDATE token_inviti SET token = 'rollback-003-' || id, usato = TRUE;
    ALTER TABLE token_inviti ALTER COLUMN token SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS token_inviti_token_key ON token_inviti(token);
    CREATE INDEX IF NOT EXISTS idx_token_inviti_token ON token_inviti(token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_token_inviti_usato ON token_inviti(usato);

DROP INDEX IF EXISTS idx_token_hash_unico;
DROP INDEX IF EXISTS idx_token_attivo_unico;
DROP INDEX IF EXISTS idx_token_stato;

ALTER TABLE token_inviti DROP CONSTRAINT IF EXISTS chk_token_stato;

ALTER TABLE token_inviti
  DROP COLUMN IF EXISTS token_hash,
  DROP COLUMN IF EXISTS prefisso,
  DROP COLUMN IF EXISTS stato,
  DROP COLUMN IF EXISTS data_revoca;

-- ==============================================================================
-- 3. Funzioni come le lasciava la 002
-- ==============================================================================
DROP FUNCTION IF EXISTS genera_token_invito(INTEGER, INTEGER);
CREATE FUNCTION genera_token_invito(p_user_id INTEGER, p_giorni_validita INTEGER DEFAULT 30)
RETURNS VARCHAR AS $$
DECLARE
    v_token VARCHAR(64);
BEGIN
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO token_inviti (user_id, token, scadenza)
    VALUES (p_user_id, v_token, NOW() + (p_giorni_validita || ' days')::INTERVAL);

    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS usa_token_invito(VARCHAR, INTEGER);
CREATE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_user_id         INTEGER;
    v_collegamento_id INTEGER;
    v_stato           VARCHAR(20);
BEGIN
    UPDATE token_inviti
    SET usato = TRUE,
        commercialista_id = p_commercialista_id,
        data_utilizzo = NOW()
    WHERE token = p_token
      AND usato = FALSE
      AND scadenza >= NOW()
    RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        SELECT usato INTO v_stato FROM token_inviti WHERE token = p_token;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Token non valido';
        END IF;
        IF EXISTS (SELECT 1 FROM token_inviti WHERE token = p_token AND usato = TRUE) THEN
            RAISE EXCEPTION 'Token gia'' utilizzato';
        END IF;
        RAISE EXCEPTION 'Token scaduto';
    END IF;

    SELECT id, stato INTO v_collegamento_id, v_stato
    FROM collegamenti_commercialista
    WHERE commercialista_id = p_commercialista_id
      AND user_id = v_user_id
      AND stato IN ('in_attesa','attiva','sospesa')
    FOR UPDATE;

    IF v_collegamento_id IS NOT NULL THEN
        RETURN v_collegamento_id;
    END IF;

    INSERT INTO collegamenti_commercialista
        (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
    VALUES
        (p_commercialista_id, v_user_id, 'in_attesa', 'commercialista', NOW())
    RETURNING id INTO v_collegamento_id;

    RETURN v_collegamento_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
