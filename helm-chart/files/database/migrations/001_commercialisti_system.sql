-- Migration 001: Commercialisti System
-- Adds tables and relationships for commercialisti (accountants) functionality

-- ==============================================================================
-- 1. COMMERCIALISTI TABLE
-- ==============================================================================
-- Separate table for commercialisti (not users)
CREATE TABLE commercialisti (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    ragione_sociale VARCHAR(200),  -- Business name
    partita_iva VARCHAR(11),        -- VAT number (Italian)
    telefono VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_commercialisti_username ON commercialisti(username);
CREATE INDEX idx_commercialisti_email ON commercialisti(email);
CREATE INDEX idx_commercialisti_partita_iva ON commercialisti(partita_iva);

-- ==============================================================================
-- 2. TOKEN INVITI (INVITATION TOKENS)
-- ==============================================================================
-- Users generate tokens to invite their commercialista
CREATE TABLE token_inviti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    scadenza TIMESTAMP NOT NULL,  -- Expiration date
    usato BOOLEAN DEFAULT FALSE,
    commercialista_id INTEGER REFERENCES commercialisti(id) ON DELETE SET NULL,
    data_utilizzo TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_token_inviti_token ON token_inviti(token);
CREATE INDEX idx_token_inviti_user_id ON token_inviti(user_id);
CREATE INDEX idx_token_inviti_usato ON token_inviti(usato);

-- ==============================================================================
-- 3. COLLEGAMENTI COMMERCIALISTA (CONNECTIONS)
-- ==============================================================================
-- Many-to-many relationship: one commercialista can have multiple users
CREATE TABLE collegamenti_commercialista (
    id SERIAL PRIMARY KEY,
    commercialista_id INTEGER NOT NULL REFERENCES commercialisti(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    data_collegamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attivo BOOLEAN DEFAULT TRUE,
    note TEXT,
    UNIQUE(commercialista_id, user_id)
);

-- Indexes
CREATE INDEX idx_collegamenti_commercialista_id ON collegamenti_commercialista(commercialista_id);
CREATE INDEX idx_collegamenti_user_id ON collegamenti_commercialista(user_id);
CREATE INDEX idx_collegamenti_attivo ON collegamenti_commercialista(attivo);

-- ==============================================================================
-- 4. ADD COMMERCIALISTA_ID TO UTENTI TABLE
-- ==============================================================================
-- Add reference to commercialista in users table (nullable)
ALTER TABLE utenti ADD COLUMN commercialista_id INTEGER REFERENCES commercialisti(id) ON DELETE SET NULL;
CREATE INDEX idx_utenti_commercialista_id ON utenti(commercialista_id);

-- ==============================================================================
-- 5. MESSAGGI COMMERCIALISTA (ASYNC CHAT)
-- ==============================================================================
-- Asynchronous communication between user and commercialista
CREATE TABLE messaggi_commercialista (
    id SERIAL PRIMARY KEY,
    collegamento_id INTEGER NOT NULL REFERENCES collegamenti_commercialista(id) ON DELETE CASCADE,
    mittente_tipo VARCHAR(20) NOT NULL CHECK (mittente_tipo IN ('user', 'commercialista')),
    mittente_id INTEGER NOT NULL,
    messaggio TEXT NOT NULL,
    letto BOOLEAN DEFAULT FALSE,
    data_lettura TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_messaggi_collegamento_id ON messaggi_commercialista(collegamento_id);
CREATE INDEX idx_messaggi_letto ON messaggi_commercialista(letto);
CREATE INDEX idx_messaggi_created_at ON messaggi_commercialista(created_at DESC);

-- ==============================================================================
-- 6. TRIGGER FOR UPDATED_AT
-- ==============================================================================
-- Update timestamp on record update
CREATE OR REPLACE FUNCTION update_commercialista_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_commercialisti_updated_at
    BEFORE UPDATE ON commercialisti
    FOR EACH ROW
    EXECUTE FUNCTION update_commercialista_updated_at();

-- ==============================================================================
-- 7. FUNCTION: Get commercialista clients summary
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_commercialista_clients_summary(p_commercialista_id INTEGER)
RETURNS TABLE (
    user_id INTEGER,
    username VARCHAR,
    email VARCHAR,
    saldo_totale DECIMAL,
    numero_conti INTEGER,
    numero_movimenti INTEGER,
    ultimo_movimento TIMESTAMP,
    ultima_modifica TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    WITH user_accounts AS (
        SELECT
            cc.user_id,
            cc.id as conto_id,
            cc.saldo_iniziale,
            cc.updated_at as conto_updated_at,
            COALESCE((
                SELECT SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END)
                FROM movimenti m
                WHERE m.conto_id = cc.id
            ), 0) as saldo_movimenti
        FROM collegamenti_commercialista col
        JOIN conti_correnti cc ON cc.user_id = col.user_id
        WHERE col.commercialista_id = p_commercialista_id
        AND col.attivo = TRUE
        AND cc.attivo = TRUE
    ),
    user_movements AS (
        SELECT
            cc.user_id,
            COUNT(m.id) as num_movimenti,
            MAX(m.data)::TIMESTAMP as ultimo_mov,
            MAX(m.created_at) as ultimo_movimento_created
        FROM collegamenti_commercialista col
        JOIN conti_correnti cc ON cc.user_id = col.user_id
        LEFT JOIN movimenti m ON m.conto_id = cc.id
        WHERE col.commercialista_id = p_commercialista_id
        AND col.attivo = TRUE
        AND cc.attivo = TRUE
        GROUP BY cc.user_id
    )
    SELECT
        u.id,
        u.username,
        u.email,
        COALESCE(SUM(ua.saldo_iniziale + ua.saldo_movimenti), 0) as saldo_totale,
        COUNT(DISTINCT ua.conto_id)::INTEGER as numero_conti,
        COALESCE(um.num_movimenti, 0)::INTEGER as numero_movimenti,
        um.ultimo_mov as ultimo_movimento,
        GREATEST(
            u.updated_at,
            COALESCE(MAX(ua.conto_updated_at), u.updated_at),
            COALESCE(um.ultimo_movimento_created, u.updated_at)
        ) as ultima_modifica
    FROM collegamenti_commercialista col
    JOIN utenti u ON u.id = col.user_id
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
    LEFT JOIN user_movements um ON um.user_id = u.id
    WHERE col.commercialista_id = p_commercialista_id
    AND col.attivo = TRUE
    GROUP BY u.id, u.username, u.email, u.updated_at, um.num_movimenti, um.ultimo_mov, um.ultimo_movimento_created;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. FUNCTION: Generate invitation token
-- ==============================================================================
CREATE OR REPLACE FUNCTION genera_token_invito(p_user_id INTEGER, p_giorni_validita INTEGER DEFAULT 30)
RETURNS VARCHAR AS $$
DECLARE
    v_token VARCHAR(64);
BEGIN
    -- Generate random token
    v_token := encode(gen_random_bytes(32), 'hex');

    -- Insert token
    INSERT INTO token_inviti (user_id, token, scadenza)
    VALUES (p_user_id, v_token, NOW() + (p_giorni_validita || ' days')::INTERVAL);

    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 9. FUNCTION: Use invitation token
-- ==============================================================================
CREATE OR REPLACE FUNCTION usa_token_invito(p_token VARCHAR, p_commercialista_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id INTEGER;
    v_scadenza TIMESTAMP;
    v_usato BOOLEAN;
BEGIN
    -- Get token details
    SELECT user_id, scadenza, usato
    INTO v_user_id, v_scadenza, v_usato
    FROM token_inviti
    WHERE token = p_token;

    -- Check if token exists
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Token non valido';
    END IF;

    -- Check if already used
    IF v_usato THEN
        RAISE EXCEPTION 'Token già utilizzato';
    END IF;

    -- Check if expired
    IF v_scadenza < NOW() THEN
        RAISE EXCEPTION 'Token scaduto';
    END IF;

    -- Create connection
    INSERT INTO collegamenti_commercialista (commercialista_id, user_id)
    VALUES (p_commercialista_id, v_user_id)
    ON CONFLICT (commercialista_id, user_id) DO UPDATE
    SET attivo = TRUE, data_collegamento = NOW();

    -- Update user with commercialista_id
    UPDATE utenti SET commercialista_id = p_commercialista_id WHERE id = v_user_id;

    -- Mark token as used
    UPDATE token_inviti
    SET usato = TRUE,
        commercialista_id = p_commercialista_id,
        data_utilizzo = NOW()
    WHERE token = p_token;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 10. FUNCTION: Disconnect client from commercialista
-- ==============================================================================
CREATE OR REPLACE FUNCTION disconnetti_cliente_commercialista(
    p_commercialista_id INTEGER,
    p_user_id INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
    -- Disattiva il collegamento
    UPDATE collegamenti_commercialista
    SET attivo = FALSE
    WHERE commercialista_id = p_commercialista_id
    AND user_id = p_user_id
    AND attivo = TRUE;

    IF FOUND THEN
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Collegamento non trovato o già disattivato';
    END IF;
END;
$$ LANGUAGE plpgsql;
