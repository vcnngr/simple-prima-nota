-- Database Schema per Prima Nota Contabile
-- PostgreSQL - Script di inizializzazione

-- Connessione al database prima_nota (assicurati che esista)
\c prima_nota;

-- Drop delle tabelle esistenti (se presenti) per ricreazione pulita
DROP TABLE IF EXISTS movimenti CASCADE;
DROP TABLE IF EXISTS anagrafiche CASCADE;
DROP TABLE IF EXISTS conti_correnti CASCADE;
DROP TABLE IF EXISTS utenti CASCADE;

-- Drop delle funzioni esistenti
DROP FUNCTION IF EXISTS calcola_saldo_conto(INTEGER);
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop delle view esistenti
DROP VIEW IF EXISTS v_saldi_conti;
DROP VIEW IF EXISTS v_movimenti_dettaglio;

-- Tabella utenti
CREATE TABLE utenti (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella conti correnti
CREATE TABLE conti_correnti (
    id SERIAL PRIMARY KEY,
    nome_banca VARCHAR(100) NOT NULL,
    intestatario VARCHAR(100) NOT NULL,
    iban VARCHAR(34),
    saldo_iniziale DECIMAL(15,2) DEFAULT 0.00,
    attivo BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella anagrafiche (clienti/fornitori)
CREATE TABLE anagrafiche (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Cliente', 'Fornitore')),
    categoria VARCHAR(50),
    email VARCHAR(100),
    telefono VARCHAR(20),
    piva VARCHAR(20),
    indirizzo TEXT,
    attivo BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella movimenti
CREATE TABLE movimenti (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    anagrafica_id INTEGER REFERENCES anagrafiche(id),
    conto_id INTEGER REFERENCES conti_correnti(id) ON DELETE CASCADE,
    descrizione TEXT NOT NULL,
    importo DECIMAL(15,2) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Entrata', 'Uscita')),
    note TEXT,
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici per performance
CREATE INDEX idx_movimenti_data ON movimenti(data);
CREATE INDEX idx_movimenti_conto ON movimenti(conto_id);
CREATE INDEX idx_movimenti_anagrafica ON movimenti(anagrafica_id);
CREATE INDEX idx_movimenti_user ON movimenti(user_id);
CREATE INDEX idx_anagrafiche_tipo ON anagrafiche(tipo);
CREATE INDEX idx_anagrafiche_user ON anagrafiche(user_id);
CREATE INDEX idx_conti_user ON conti_correnti(user_id);

-- Funzione per calcolare saldo corrente
CREATE OR REPLACE FUNCTION calcola_saldo_conto(conto_id_param INTEGER)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    saldo_iniziale DECIMAL(15,2);
    saldo_movimenti DECIMAL(15,2);
BEGIN
    -- Ottieni saldo iniziale
    SELECT saldo_iniziale INTO saldo_iniziale 
    FROM conti_correnti 
    WHERE id = conto_id_param;
    
    -- Calcola saldo dai movimenti
    SELECT COALESCE(
        SUM(CASE 
            WHEN tipo = 'Entrata' THEN importo 
            WHEN tipo = 'Uscita' THEN -importo 
            ELSE 0 
        END), 0
    ) INTO saldo_movimenti
    FROM movimenti 
    WHERE conto_id = conto_id_param;
    
    RETURN COALESCE(saldo_iniziale, 0) + COALESCE(saldo_movimenti, 0);
END;
$$ LANGUAGE plpgsql;

-- Trigger per aggiornare updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_utenti_updated_at BEFORE UPDATE ON utenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conti_updated_at BEFORE UPDATE ON conti_correnti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_anagrafiche_updated_at BEFORE UPDATE ON anagrafiche
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_movimenti_updated_at BEFORE UPDATE ON movimenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Dati di esempio
INSERT INTO utenti (username, password_hash, email) VALUES
('admin', '$2b$10$yxaU3JOqC8dpeH8fLFtRWOAzzNvqTNQNF44GcPIxWtct6B54HEEuK', 'admin@example.com'),
('demo', '$2b$10$7gusA60TTbNH2RMgwdGm0.3ZYMAtgLG2CTsLMuFF8nSuH4kCmtwrO', 'demo@example.com');

INSERT INTO conti_correnti (nome_banca, intestatario, iban, saldo_iniziale, user_id) VALUES
('Banca Intesa', 'Mario Rossi', 'IT60X0542811101000000123456', 5000.00, 1),
('UniCredit', 'Mario Rossi', 'IT45R0300203280284975791020', 2500.00, 1),
('PostePay Evolution', 'Mario Rossi', 'IT76P0760103200000001234567', 800.00, 1);

INSERT INTO anagrafiche (nome, tipo, categoria, email, telefono, piva, user_id) VALUES
('Fornitore Materiali SRL', 'Fornitore', 'Materiali', 'info@fornitoremateriali.it', '0123456789', '12345678901', 1),
('Cliente Principale SpA', 'Cliente', 'Azienda', 'cliente@principale.it', '0987654321', '10987654321', 1),
('Consulente Fiscale', 'Fornitore', 'Servizi', 'consulente@fiscale.it', '0555123456', '11122233344', 1),
('Cliente Privato', 'Cliente', 'Privato', 'privato@email.it', '3331234567', NULL, 1),
('Fornitore Energia', 'Fornitore', 'Utenze', 'bollette@energia.it', '800123456', '99988877766', 1);

INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, importo, tipo, note, user_id) VALUES
('2024-12-01', 2, 1, 'Fattura n. 001/2024', 1200.00, 'Entrata', 'Pagamento fattura dicembre', 1),
('2024-12-02', 1, 1, 'Acquisto materiali', 450.00, 'Uscita', 'Materiali per progetto X', 1),
('2024-12-03', 3, 1, 'Consulenza fiscale', 200.00, 'Uscita', 'Consulenza mensile', 1),
('2024-12-05', 4, 2, 'Servizio consulenza', 800.00, 'Entrata', 'Consulenza privata', 1),
('2024-12-07', 5, 2, 'Bolletta energia', 150.00, 'Uscita', 'Bolletta novembre', 1),
('2024-12-10', 2, 1, 'Fattura n. 002/2024', 950.00, 'Entrata', 'Secondo pagamento dicembre', 1),
('2024-12-12', 1, 3, 'Acquisto attrezzature', 320.00, 'Uscita', 'Nuove attrezzature', 1),
('2024-12-15', 4, 1, 'Consulenza extra', 400.00, 'Entrata', 'Lavoro straordinario', 1);

-- View per report rapidi
CREATE VIEW v_saldi_conti AS
SELECT 
    cc.id,
    cc.nome_banca,
    cc.intestatario,
    cc.iban,
    cc.saldo_iniziale,
    calcola_saldo_conto(cc.id) as saldo_corrente,
    cc.attivo,
    cc.user_id
FROM conti_correnti cc
WHERE cc.attivo = true;

CREATE VIEW v_movimenti_dettaglio AS
SELECT 
    m.id,
    m.data,
    a.nome as anagrafica_nome,
    a.tipo as anagrafica_tipo,
    cc.nome_banca,
    m.descrizione,
    m.importo,
    m.tipo,
    m.note,
    m.created_at,
    m.user_id
FROM movimenti m
LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
ORDER BY m.data DESC, m.created_at DESC;

-- Verifica che le tabelle siano state create correttamente
SELECT 'Tabelle create con successo!' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
