-- ==============================================================================
-- 004 DOWN — rimette le funzioni come le scriveva la 003
-- ==============================================================================
-- Rieseguibile. Non tocca dati: la 004 cambia solo due funzioni.
-- ATTENZIONE: tornare indietro riapre i due difetti chiusi dalla 004
-- (richieste concorrenti -> 23505/HTTP 500; risoluzione case-insensitive che
-- sceglie arbitrariamente fra omonimi). Va usato solo per annullare la 004.
-- ==============================================================================

BEGIN;

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

CREATE OR REPLACE FUNCTION richiedi_collegamento(
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
