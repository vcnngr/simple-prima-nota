-- ==============================================================================
-- FILE: database/init.sql
-- POSIZIONE: database/init.sql (PER INSTALLAZIONI NUOVE)
-- DESCRIZIONE: Schema completo Prima Nota Contabile con sistema categorie flessibili
-- ==============================================================================

-- Abilita estensioni
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABELLA UTENTI
-- ==============================================================================
CREATE TABLE IF NOT EXISTS utenti (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indici utenti
CREATE INDEX IF NOT EXISTS idx_utenti_username ON utenti(username);
CREATE INDEX IF NOT EXISTS idx_utenti_email ON utenti(email);

-- ==============================================================================
-- 2. TABELLA CONTI CORRENTI
-- ==============================================================================
CREATE TABLE IF NOT EXISTS conti_correnti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome_banca VARCHAR(100) NOT NULL,
    intestatario VARCHAR(100) NOT NULL,
    iban VARCHAR(34),
    saldo_iniziale DECIMAL(15,2) DEFAULT 0.00,
    attivo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indici conti correnti
CREATE INDEX IF NOT EXISTS idx_conti_correnti_user_id ON conti_correnti(user_id);
CREATE INDEX IF NOT EXISTS idx_conti_correnti_attivo ON conti_correnti(user_id, attivo);

-- ==============================================================================
-- 3. TABELLA CATEGORIE ANAGRAFICHE (NUOVO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS categorie_anagrafiche (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descrizione TEXT,
    colore VARCHAR(7) DEFAULT '#6B7280',
    attiva BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, nome)
);

-- Indici categorie anagrafiche
CREATE INDEX IF NOT EXISTS idx_categorie_anagrafiche_user_id ON categorie_anagrafiche(user_id);
CREATE INDEX IF NOT EXISTS idx_categorie_anagrafiche_nome ON categorie_anagrafiche(user_id, nome);
CREATE INDEX IF NOT EXISTS idx_categorie_anagrafiche_attiva ON categorie_anagrafiche(user_id, attiva);

-- ==============================================================================
-- 4. TABELLA ANAGRAFICHE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS anagrafiche (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Cliente', 'Fornitore')) NOT NULL,
    categoria VARCHAR(100), -- ✅ RESO FLESSIBILE
    email VARCHAR(100),
    telefono VARCHAR(20),
    piva VARCHAR(20),
    indirizzo TEXT,
    attivo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indici anagrafiche
CREATE INDEX IF NOT EXISTS idx_anagrafiche_user_id ON anagrafiche(user_id);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_tipo ON anagrafiche(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_categoria ON anagrafiche(categoria);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_attivo ON anagrafiche(user_id, attivo);

-- ==============================================================================
-- 5. TABELLA CATEGORIE MOVIMENTI (NUOVO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS categorie_movimenti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Entrata', 'Uscita', 'Entrambi')) DEFAULT 'Entrambi',
    descrizione TEXT,
    colore VARCHAR(7) DEFAULT '#6B7280',
    attiva BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, nome)
);

-- Indici categorie movimenti
CREATE INDEX IF NOT EXISTS idx_categorie_movimenti_user_id ON categorie_movimenti(user_id);
CREATE INDEX IF NOT EXISTS idx_categorie_movimenti_tipo ON categorie_movimenti(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_categorie_movimenti_attiva ON categorie_movimenti(user_id, attiva);

-- ==============================================================================
-- 6. TABELLA MOVIMENTI
-- ==============================================================================
CREATE TABLE IF NOT EXISTS movimenti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    anagrafica_id INTEGER REFERENCES anagrafiche(id) ON DELETE SET NULL,
    conto_id INTEGER NOT NULL REFERENCES conti_correnti(id) ON DELETE CASCADE,
    descrizione VARCHAR(255) NOT NULL,
    categoria VARCHAR(100), -- ✅ NUOVO CAMPO FLESSIBILE
    importo DECIMAL(15,2) NOT NULL CHECK (importo > 0),
    tipo VARCHAR(10) CHECK (tipo IN ('Entrata', 'Uscita')) NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indici movimenti
CREATE INDEX IF NOT EXISTS idx_movimenti_user_id ON movimenti(user_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_data ON movimenti(user_id, data);
CREATE INDEX IF NOT EXISTS idx_movimenti_tipo ON movimenti(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_movimenti_conto_id ON movimenti(conto_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_anagrafica_id ON movimenti(anagrafica_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_categoria ON movimenti(categoria);
CREATE INDEX IF NOT EXISTS idx_movimenti_data_desc ON movimenti(user_id, data DESC);

-- ==============================================================================
-- 7. FUNZIONI STORED PROCEDURE
-- ==============================================================================

-- Funzione per calcolare saldo conto
CREATE OR REPLACE FUNCTION calcola_saldo_conto(conto_id_param INTEGER)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    saldo_iniziale DECIMAL(15,2);
    movimento_totale DECIMAL(15,2);
    saldo_finale DECIMAL(15,2);
BEGIN
    -- Ottieni saldo iniziale
    SELECT saldo_iniziale INTO saldo_iniziale
    FROM conti_correnti 
    WHERE id = conto_id_param;
    
    IF saldo_iniziale IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Calcola totale movimenti
    SELECT COALESCE(SUM(
        CASE 
            WHEN tipo = 'Entrata' THEN importo 
            ELSE -importo 
        END
    ), 0) INTO movimento_totale
    FROM movimenti 
    WHERE conto_id = conto_id_param;
    
    saldo_finale := saldo_iniziale + movimento_totale;
    
    RETURN saldo_finale;
END;
$$ LANGUAGE plpgsql;

-- Funzione per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. TRIGGER PER UPDATED_AT
-- ==============================================================================

-- Trigger per utenti
CREATE TRIGGER update_utenti_updated_at 
    BEFORE UPDATE ON utenti 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per conti correnti
CREATE TRIGGER update_conti_correnti_updated_at 
    BEFORE UPDATE ON conti_correnti 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per categorie anagrafiche
CREATE TRIGGER update_categorie_anagrafiche_updated_at 
    BEFORE UPDATE ON categorie_anagrafiche 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per anagrafiche
CREATE TRIGGER update_anagrafiche_updated_at 
    BEFORE UPDATE ON anagrafiche 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per categorie movimenti
CREATE TRIGGER update_categorie_movimenti_updated_at 
    BEFORE UPDATE ON categorie_movimenti 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per movimenti
CREATE TRIGGER update_movimenti_updated_at 
    BEFORE UPDATE ON movimenti 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 9. DATI DI ESEMPIO (OPZIONALI)
-- ==============================================================================

-- Utente di test (password: password123)
INSERT INTO utenti (username, email, password_hash) 
VALUES (
    'admin', 
    'admin@primanota.local', 
    '$2b$10$yxaU3JOqC8dpeH8fLFtRWOAzzNvqTNQNF44GcPIxWtct6B54HEEuK'
) ON CONFLICT (username) DO NOTHING;

-- Categorie anagrafiche di default per l'utente admin
INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT u.id, 'Generale', 'Categoria generale per anagrafiche', '#6B7280'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT u.id, 'Clienti Premium', 'Clienti di alto valore', '#10B981'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT u.id, 'Fornitori Principali', 'Fornitori strategici', '#F59E0B'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT u.id, 'Consulenti', 'Professionisti e consulenti', '#8B5CF6'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

-- Categorie movimenti di default per l'utente admin
INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Generale', 'Entrambi', 'Categoria generale per movimenti', '#6B7280'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Vendite', 'Entrata', 'Ricavi da vendite di prodotti/servizi', '#10B981'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Consulenze', 'Entrata', 'Ricavi da attività di consulenza', '#06B6D4'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Spese Operative', 'Uscita', 'Costi operativi generali', '#EF4444'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Stipendi', 'Uscita', 'Pagamenti stipendi e compensi', '#8B5CF6'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Materiali', 'Uscita', 'Acquisto di materiali e forniture', '#F59E0B'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT u.id, 'Tasse', 'Uscita', 'Pagamenti fiscali e tributari', '#EC4899'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT (user_id, nome) DO NOTHING;

-- Conto corrente di esempio
INSERT INTO conti_correnti (user_id, nome_banca, intestatario, iban, saldo_iniziale)
SELECT u.id, 'Banca Esempio', 'Mario Rossi', 'IT60X0542811101000000123456', 10000.00
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

-- Anagrafiche di esempio
INSERT INTO anagrafiche (user_id, nome, tipo, categoria, email, telefono)
SELECT u.id, 'Cliente Esempio SRL', 'Cliente', 'Clienti Premium', 'cliente@esempio.it', '+39 123 456 7890'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO anagrafiche (user_id, nome, tipo, categoria, email, telefono)
SELECT u.id, 'Fornitore Test SPA', 'Fornitore', 'Fornitori Principali', 'fornitore@test.it', '+39 098 765 4321'
FROM utenti u WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

-- Movimenti di esempio
INSERT INTO movimenti (user_id, data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note)
SELECT 
    u.id, 
    CURRENT_DATE - INTERVAL '7 days',
    a.id,
    c.id,
    'Fattura di vendita esempio',
    'Vendite',
    1500.00,
    'Entrata',
    'Fattura nr. 001/2024'
FROM utenti u
CROSS JOIN anagrafiche a
CROSS JOIN conti_correnti c
WHERE u.username = 'admin' 
  AND a.user_id = u.id 
  AND a.tipo = 'Cliente'
  AND c.user_id = u.id
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO movimenti (user_id, data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note)
SELECT 
    u.id, 
    CURRENT_DATE - INTERVAL '5 days',
    a.id,
    c.id,
    'Acquisto materiali ufficio',
    'Materiali',
    350.00,
    'Uscita',
    'Fattura FOR-123/2024'
FROM utenti u
CROSS JOIN anagrafiche a
CROSS JOIN conti_correnti c
WHERE u.username = 'admin' 
  AND a.user_id = u.id 
  AND a.tipo = 'Fornitore'
  AND c.user_id = u.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 10. VISTA RIEPILOGATIVA (OPZIONALE)
-- ==============================================================================
CREATE OR REPLACE VIEW vista_movimenti_completa AS
SELECT 
    m.id,
    m.user_id,
    m.data,
    m.descrizione,
    m.categoria,
    m.importo,
    m.tipo,
    m.note,
    a.nome as anagrafica_nome,
    a.tipo as anagrafica_tipo,
    a.categoria as anagrafica_categoria,
    cc.nome_banca,
    cc.intestatario,
    cm.colore as categoria_colore,
    m.created_at,
    m.updated_at
FROM movimenti m
LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
LEFT JOIN categorie_movimenti cm ON m.categoria = cm.nome AND m.user_id = cm.user_id;

-- ==============================================================================
-- 11. COMMENTI DOCUMENTAZIONE
-- ==============================================================================
COMMENT ON TABLE utenti IS 'Utenti del sistema Prima Nota';
COMMENT ON TABLE conti_correnti IS 'Conti correnti bancari degli utenti';
COMMENT ON TABLE categorie_anagrafiche IS 'Categorie personalizzabili per anagrafiche';
COMMENT ON TABLE anagrafiche IS 'Clienti e fornitori';
COMMENT ON TABLE categorie_movimenti IS 'Categorie personalizzabili per movimenti';
COMMENT ON TABLE movimenti IS 'Movimenti contabili (entrate e uscite)';

COMMENT ON COLUMN categorie_anagrafiche.colore IS 'Colore hex per UI (#RRGGBB)';
COMMENT ON COLUMN categorie_movimenti.tipo IS 'Tipo movimento: Entrata, Uscita o Entrambi';
COMMENT ON COLUMN categorie_movimenti.colore IS 'Colore hex per UI (#RRGGBB)';
COMMENT ON COLUMN anagrafiche.categoria IS 'Categoria flessibile definita dall\'utente';
COMMENT ON COLUMN movimenti.categoria IS 'Categoria flessibile per classificazione movimento';

COMMENT ON FUNCTION calcola_saldo_conto(INTEGER) IS 'Calcola il saldo corrente di un conto';
COMMENT ON FUNCTION update_updated_at_column() IS 'Aggiorna automaticamente il campo updated_at';

-- ==============================================================================
-- FINE INIZIALIZZAZIONE DATABASE
-- ==============================================================================

-- Verifica installazione
DO $$ 
BEGIN
    RAISE NOTICE 'Prima Nota Contabile - Database inizializzato con successo!';
    RAISE NOTICE 'Versione: 2.0 con Sistema Categorie Flessibili';
    RAISE NOTICE 'Tabelle create: %, %, %, %, %, %', 
        'utenti', 'conti_correnti', 'categorie_anagrafiche', 
        'anagrafiche', 'categorie_movimenti', 'movimenti';
    RAISE NOTICE 'Utente di test: admin / password123';
END $$;