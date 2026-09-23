-- ==============================================================================
-- 004 — Richieste di collegamento: idempotenti e senza scelta arbitraria
-- ==============================================================================
-- Chiude due difetti della 003, entrambi trovati in revisione avversariale.
--
-- 1. `richiedi_collegamento_interno` leggeva e poi inseriva (SELECT ... FOR UPDATE
--    seguito da INSERT). Su una coppia NUOVA non c'e' ancora nessuna riga da
--    bloccare: due richieste concorrenti superavano entrambe la lettura, e la
--    seconda sbatteva contro l'indice unico parziale della 002 con un 23505 che
--    la route traduceva in HTTP 500. Oltre al 500, era un oracolo: per un cliente
--    inesistente la risposta restava 202, per uno esistente poteva diventare 500,
--    e la risposta uniforme dell'endpoint smetteva di essere uniforme.
--    Qui l'inserimento passa da ON CONFLICT ... DO NOTHING sullo stesso predicato
--    dell'indice: chi perde la gara non fallisce, rilegge la riga dell'altro.
--
-- 2. `richiedi_collegamento` risolveva il cliente con lower(...) ORDER BY id
--    LIMIT 1, mentre `utenti` ha UNIQUE case-sensitive su username ed email.
--    Con 'Mario' e 'mario' entrambi registrati, la richiesta per 'mario' apriva
--    il collegamento su 'Mario' — il commercialista sbagliato sul cliente
--    sbagliato. Ora vince la corrispondenza esatta; la normalizzata si usa solo
--    se e' una sola. Ambiguo = NULL, e la route risponde 202 come sempre: non
--    si sceglie a caso e non si rivela niente.
--
-- Nessuna modifica di schema: solo due funzioni. Rollback in
-- 004_richieste_idempotenti_down.sql, che rimette le versioni della 003.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION richiedi_collegamento_interno(
    p_commercialista_id INTEGER,
    p_user_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_id        INTEGER;
    v_tentativi INTEGER := 0;
BEGIN
    LOOP
        v_id := NULL;

        -- Collegamento gia' aperto: lo si riusa senza toccarne lo stato.
        SELECT id INTO v_id
        FROM collegamenti_commercialista
        WHERE commercialista_id = p_commercialista_id
          AND user_id = p_user_id
          AND stato IN ('in_attesa','attiva','sospesa')
        FOR UPDATE;

        IF v_id IS NOT NULL THEN
            RETURN v_id;
        END IF;

        -- Nessuno aperto: se ne apre uno. DO NOTHING sul predicato dell'indice
        -- parziale: PostgreSQL attende l'esito della transazione concorrente,
        -- quindi al giro successivo la SELECT vede la riga che ha vinto.
        INSERT INTO collegamenti_commercialista
            (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
        VALUES
            (p_commercialista_id, p_user_id, 'in_attesa', 'commercialista', NOW())
        ON CONFLICT (commercialista_id, user_id)
            WHERE stato IN ('in_attesa','attiva','sospesa')
            DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            RETURN v_id;
        END IF;

        -- Il perdente rilegge. Il contatore e' solo una cintura: senza, un caso
        -- non previsto diventerebbe un ciclo infinito dentro il database.
        v_tentativi := v_tentativi + 1;
        IF v_tentativi >= 5 THEN
            RAISE EXCEPTION 'Impossibile aprire la richiesta di collegamento';
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION richiedi_collegamento(
    p_commercialista_id INTEGER,
    p_identificativo VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    v_ident   VARCHAR := trim(p_identificativo);
    v_user_id INTEGER;
    v_n       INTEGER;
BEGIN
    -- 1. Corrispondenza esatta. username ed email sono UNIQUE case-sensitive,
    --    ma un username puo' coincidere con l'email di un altro: se le righe
    --    sono due, l'identificativo e' ambiguo e non si indovina.
    SELECT count(*), min(id) INTO v_n, v_user_id
    FROM utenti
    WHERE username = v_ident OR email = v_ident;

    IF v_n > 1 THEN
        RETURN NULL;
    END IF;

    -- 2. Nessuna esatta: si prova la normalizzata, ma solo se ne esiste UNA.
    IF v_n = 0 THEN
        SELECT count(*), min(id) INTO v_n, v_user_id
        FROM utenti
        WHERE lower(username) = lower(v_ident) OR lower(email) = lower(v_ident);

        IF v_n <> 1 THEN
            RETURN NULL;
        END IF;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN richiedi_collegamento_interno(p_commercialista_id, v_user_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
