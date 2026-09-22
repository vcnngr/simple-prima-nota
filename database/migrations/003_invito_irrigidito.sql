-- Migration 003: Invito irrigidito (blocco W2)
--
-- Il token di invito smette di essere un segreto conservato in chiaro a tempo
-- indeterminato e diventa:
--   * un HASH SHA-256 in tabella; il valore si vede una volta sola, alla generazione;
--   * uno per utente alla volta (indice unico parziale sugli attivi);
--   * revocabile senza cancellare la riga (`stato='revocato'`, lo storico resta).
--
-- Aggiunge inoltre il percorso di collegamento che non passa dal token:
-- il commercialista chiede il collegamento nominando il cliente (username o email),
-- e il cliente accetta. Il token resta solo per il commercialista non ancora registrato.
--
-- Rollback: 003_invito_irrigidito_down.sql
-- ATTENZIONE: il rollback NON puo' ricostruire i token in chiaro (e' il punto della
-- migrazione). I token emessi prima del rollback diventano inutilizzabili e vanno
-- rigenerati. Nessun altro dato si perde.
--
-- Idempotente: si puo' applicare piu' volte senza errori.

BEGIN;

-- ==============================================================================
-- 1. TOKEN_INVITI: hash, stato, un solo token attivo
-- ==============================================================================

ALTER TABLE token_inviti
  ADD COLUMN IF NOT EXISTS token_hash  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS prefisso    VARCHAR(12),
  ADD COLUMN IF NOT EXISTS stato       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS data_revoca TIMESTAMP;

-- Conversione delle righe esistenti: finche' la colonna in chiaro c'e', l'hash si
-- calcola da li'. sha256() e' in core da PostgreSQL 11: nessuna dipendenza da pgcrypto.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_inviti' AND column_name = 'token'
  ) THEN
    UPDATE token_inviti
    SET token_hash = COALESCE(token_hash, encode(sha256(convert_to(token, 'UTF8')), 'hex')),
        prefisso   = COALESCE(prefisso, left(token, 8))
    WHERE token IS NOT NULL;
  END IF;
END $$;

UPDATE token_inviti
SET stato = CASE
      WHEN usato THEN 'usato'
      WHEN scadenza < NOW() THEN 'scaduto'
      ELSE 'attivo'
    END
WHERE stato IS NULL;

-- Un solo token attivo per utente: dei preesistenti sopravvive il piu' recente,
-- gli altri diventano revocati. Senza questo passaggio l'indice unico parziale
-- fallirebbe su qualunque database gia' in uso.
UPDATE token_inviti t
SET stato = 'revocato',
    data_revoca = COALESCE(t.data_revoca, NOW())
WHERE t.stato = 'attivo'
  AND t.id <> (
    SELECT t2.id FROM token_inviti t2
    WHERE t2.user_id = t.user_id AND t2.stato = 'attivo'
    ORDER BY t2.created_at DESC NULLS LAST, t2.id DESC
    LIMIT 1
  );

ALTER TABLE token_inviti
  ALTER COLUMN stato SET DEFAULT 'attivo',
  ALTER COLUMN stato SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_token_stato') THEN
    ALTER TABLE token_inviti
      ADD CONSTRAINT chk_token_stato CHECK (stato IN ('attivo','usato','revocato','scaduto'));
  END IF;
END $$;

-- Via il valore in chiaro. Da qui in poi il database non e' piu' in grado di
-- restituire un token: puo' solo confermare che quello presentato corrisponde.
ALTER TABLE token_inviti DROP COLUMN IF EXISTS token;

ALTER TABLE token_inviti ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_hash_unico ON token_inviti(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_attivo_unico
  ON token_inviti(user_id) WHERE stato = 'attivo';
CREATE INDEX IF NOT EXISTS idx_token_stato ON token_inviti(stato);

-- `usato` diventa una colonna generata: le letture esistenti continuano a
-- funzionare, le scritture falliscono in modo rumoroso invece di creare un
-- secondo stato divergente accanto a `stato`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_inviti'
      AND column_name = 'usato'
      AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE token_inviti DROP COLUMN usato;
    ALTER TABLE token_inviti
      ADD COLUMN usato BOOLEAN GENERATED ALWAYS AS (stato = 'usato') STORED;
  END IF;
END $$;

-- ==============================================================================
-- 2. GENERAZIONE: valore in chiaro restituito una volta sola
-- ==============================================================================
-- La funzione salva l'hash e restituisce il token: chi chiama deve consegnarlo
-- all'utente subito, perche' non e' piu' recuperabile in seguito.
DROP FUNCTION IF EXISTS genera_token_invito(INTEGER, INTEGER);
CREATE FUNCTION genera_token_invito(p_user_id INTEGER, p_giorni_validita INTEGER DEFAULT 7)
RETURNS VARCHAR AS $$
DECLARE
    v_token  VARCHAR(64);
    v_giorni INTEGER;
BEGIN
    -- La validita' e' limitata anche qui, non solo in Joi: la funzione e'
    -- richiamabile da psql e da qualunque altro punto del backend.
    v_giorni := LEAST(GREATEST(COALESCE(p_giorni_validita, 7), 1), 30);

    -- Un token scaduto non e' piu' attivo e non deve bloccare la generazione.
    UPDATE token_inviti
    SET stato = 'scaduto'
    WHERE user_id = p_user_id AND stato = 'attivo' AND scadenza < NOW();

    IF EXISTS (SELECT 1 FROM token_inviti WHERE user_id = p_user_id AND stato = 'attivo') THEN
        RAISE EXCEPTION 'Hai gia'' un token di invito attivo: revocalo prima di generarne un altro'
          USING ERRCODE = 'unique_violation';
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');

    -- Due generazioni simultanee superano entrambe l'EXISTS qui sopra: l'indice
    -- unico parziale e' il vincolo che regge davvero, e fa fallire la seconda.
    INSERT INTO token_inviti (user_id, token_hash, prefisso, scadenza, stato)
    VALUES (
        p_user_id,
        encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
        left(v_token, 8),
        NOW() + (v_giorni || ' days')::INTERVAL,
        'attivo'
    );

    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Nucleo comune al token e alla richiesta diretta: riusa il collegamento aperto se
-- c'e', altrimenti ne apre uno nuovo. Le righe terminali restano storico.
CREATE OR REPLACE FUNCTION richiedi_collegamento_interno(
    p_commercialista_id INTEGER,
    p_user_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    SELECT id INTO v_id
    FROM collegamenti_commercialista
    WHERE commercialista_id = p_commercialista_id
      AND user_id = p_user_id
      AND stato IN ('in_attesa','attiva','sospesa')
    FOR UPDATE;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO collegamenti_commercialista
        (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
    VALUES
        (p_commercialista_id, p_user_id, 'in_attesa', 'commercialista', NOW())
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. CONSUMO: confronto per hash
-- ==============================================================================
DROP FUNCTION IF EXISTS usa_token_invito(VARCHAR, INTEGER);
CREATE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_hash            VARCHAR(64);
    v_user_id         INTEGER;
    v_collegamento_id INTEGER;
    v_stato           VARCHAR(20);
    v_scadenza        TIMESTAMP;
BEGIN
    v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

    -- Consumo atomico (invariante gia' introdotta dalla 002): il primo che arriva
    -- porta via la riga, il secondo non la trova piu' attiva.
    UPDATE token_inviti
    SET stato = 'usato',
        commercialista_id = p_commercialista_id,
        data_utilizzo = NOW()
    WHERE token_hash = v_hash
      AND stato = 'attivo'
      AND scadenza >= NOW()
    RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        SELECT stato, scadenza INTO v_stato, v_scadenza
        FROM token_inviti WHERE token_hash = v_hash;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Token non valido';
        ELSIF v_stato = 'usato' THEN
            RAISE EXCEPTION 'Token gia'' utilizzato';
        ELSIF v_stato = 'revocato' THEN
            RAISE EXCEPTION 'Token revocato dal cliente';
        ELSE
            RAISE EXCEPTION 'Token scaduto';
        END IF;
    END IF;

    RETURN richiedi_collegamento_interno(p_commercialista_id, v_user_id);
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. RICHIESTA DIRETTA: il commercialista nomina il cliente, il cliente accetta
-- ==============================================================================
-- Risolve il cliente per username o email e apre la richiesta.
-- Restituisce NULL se il cliente non esiste: chi chiama deve rispondere lo stesso
-- in entrambi i casi, altrimenti l'endpoint diventa un oracolo per sapere quali
-- username ed email sono registrati.
DROP FUNCTION IF EXISTS richiedi_collegamento(INTEGER, VARCHAR);
CREATE FUNCTION richiedi_collegamento(
    p_commercialista_id INTEGER,
    p_identificativo VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    SELECT id INTO v_user_id
    FROM utenti
    WHERE lower(username) = lower(trim(p_identificativo))
       OR lower(email) = lower(trim(p_identificativo))
    ORDER BY id
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN richiedi_collegamento_interno(p_commercialista_id, v_user_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
