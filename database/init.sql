-- Database Schema per Prima Nota Contabile con Tipologie Anagrafiche Flessibili
-- PostgreSQL - Script di inizializzazione FLESSIBILE
-- Versione: 3.1 - Tipologie Anagrafiche Personalizzabili (CORRETTA)

-- Connessione al database prima_nota (assicurati che esista)
\c prima_nota;

-- Drop delle tabelle esistenti (se presenti) per ricreazione pulita
DROP TABLE IF EXISTS movimenti CASCADE;
DROP TABLE IF EXISTS anagrafiche CASCADE;
DROP TABLE IF EXISTS tipologie_anagrafiche CASCADE;
DROP TABLE IF EXISTS categorie_movimenti CASCADE;
DROP TABLE IF EXISTS categorie_anagrafiche CASCADE;
DROP TABLE IF EXISTS conti_correnti CASCADE;
DROP TABLE IF EXISTS utenti CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;

-- Drop delle funzioni esistenti
DROP FUNCTION IF EXISTS calcola_saldo_conto(INTEGER);
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS sync_anagrafica_tipo_movimento();

-- Drop delle view esistenti
DROP VIEW IF EXISTS v_saldi_conti CASCADE;
DROP VIEW IF EXISTS v_movimenti_dettaglio CASCADE;
DROP VIEW IF EXISTS vista_movimenti_completa CASCADE;

-- Abilita estensioni
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABELLA UTENTI
-- ==============================================================================
CREATE TABLE utenti (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici utenti
CREATE INDEX idx_utenti_username ON utenti(username);
CREATE INDEX idx_utenti_email ON utenti(email);

-- ==============================================================================
-- 2. TABELLA CONTI CORRENTI
-- ==============================================================================
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

-- Indici conti correnti
CREATE INDEX idx_conti_correnti_user_id ON conti_correnti(user_id);
CREATE INDEX idx_conti_correnti_attivo ON conti_correnti(user_id, attivo);

-- ==============================================================================
-- 3. TABELLA TIPOLOGIE ANAGRAFICHE (FLESSIBILE)
-- ==============================================================================
CREATE TABLE tipologie_anagrafiche (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descrizione TEXT,
    -- Mapping per movimenti: 'Entrata', 'Uscita', 'Entrambi'
    tipo_movimento_default VARCHAR(20) CHECK (tipo_movimento_default IN ('Entrata', 'Uscita', 'Entrambi')) DEFAULT 'Entrambi',
    colore VARCHAR(7) DEFAULT '#6B7280',
    icona VARCHAR(50) DEFAULT 'user', -- Nome icona (es: 'user', 'building', 'truck', 'credit-card')
    attiva BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, nome)
);

-- Indici tipologie anagrafiche
CREATE INDEX idx_tipologie_anagrafiche_user_id ON tipologie_anagrafiche(user_id);
CREATE INDEX idx_tipologie_anagrafiche_movimento ON tipologie_anagrafiche(user_id, tipo_movimento_default);
CREATE INDEX idx_tipologie_anagrafiche_attiva ON tipologie_anagrafiche(user_id, attiva);

-- ==============================================================================
-- 4. TABELLA CATEGORIE ANAGRAFICHE
-- ==============================================================================
CREATE TABLE categorie_anagrafiche (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descrizione TEXT,
    colore VARCHAR(7) DEFAULT '#6B7280',
    attiva BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, nome)
);

-- Indici categorie anagrafiche
CREATE INDEX idx_categorie_anagrafiche_user_id ON categorie_anagrafiche(user_id);
CREATE INDEX idx_categorie_anagrafiche_nome ON categorie_anagrafiche(user_id, nome);
CREATE INDEX idx_categorie_anagrafiche_attiva ON categorie_anagrafiche(user_id, attiva);

-- ==============================================================================
-- 5. TABELLA CATEGORIE MOVIMENTI
-- ==============================================================================
CREATE TABLE categorie_movimenti (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('Entrata', 'Uscita', 'Entrambi')) DEFAULT 'Entrambi',
    descrizione TEXT,
    colore VARCHAR(7) DEFAULT '#6B7280',
    attiva BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, nome)
);

-- Indici categorie movimenti
CREATE INDEX idx_categorie_movimenti_user_id ON categorie_movimenti(user_id);
CREATE INDEX idx_categorie_movimenti_tipo ON categorie_movimenti(user_id, tipo);
CREATE INDEX idx_categorie_movimenti_attiva ON categorie_movimenti(user_id, attiva);

-- ==============================================================================
-- 6. TABELLA ANAGRAFICHE (FLESSIBILE)
-- ==============================================================================
CREATE TABLE anagrafiche (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipologia_id INTEGER REFERENCES tipologie_anagrafiche(id) ON DELETE SET NULL,
    -- Manteniamo campo tipo per retrocompatibilità e query semplici
    tipo_movimento_preferito VARCHAR(20) CHECK (tipo_movimento_preferito IN ('Entrata', 'Uscita', 'Entrambi')),
    categoria VARCHAR(100), -- Campo flessibile per categoria
    email VARCHAR(100),
    telefono VARCHAR(20),
    piva VARCHAR(20),
    indirizzo TEXT,
    attivo BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, nome)
);

-- Indici anagrafiche
CREATE INDEX idx_anagrafiche_tipologia ON anagrafiche(tipologia_id);
CREATE INDEX idx_anagrafiche_user ON anagrafiche(user_id);
CREATE INDEX idx_anagrafiche_categoria ON anagrafiche(categoria);
CREATE INDEX idx_anagrafiche_attivo ON anagrafiche(user_id, attivo);
CREATE INDEX idx_anagrafiche_tipo_movimento ON anagrafiche(tipo_movimento_preferito);

-- ==============================================================================
-- 7. TABELLA MOVIMENTI
-- ==============================================================================
CREATE TABLE movimenti (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    anagrafica_id INTEGER REFERENCES anagrafiche(id) ON DELETE SET NULL,
    conto_id INTEGER REFERENCES conti_correnti(id) ON DELETE CASCADE,
    descrizione TEXT NOT NULL,
    categoria VARCHAR(100), -- Campo flessibile per categoria movimento
    importo DECIMAL(15,2) NOT NULL CHECK (importo > 0),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Entrata', 'Uscita')),
    note TEXT,
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici movimenti
CREATE INDEX idx_movimenti_data ON movimenti(data);
CREATE INDEX idx_movimenti_conto ON movimenti(conto_id);
CREATE INDEX idx_movimenti_anagrafica ON movimenti(anagrafica_id);
CREATE INDEX idx_movimenti_user ON movimenti(user_id);
CREATE INDEX idx_movimenti_tipo ON movimenti(user_id, tipo);
CREATE INDEX idx_movimenti_categoria ON movimenti(categoria);
CREATE INDEX idx_movimenti_data_desc ON movimenti(user_id, data DESC);

-- ==============================================================================
-- 8. TABELLA ALERTS
-- ==============================================================================
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    titolo VARCHAR(255) NOT NULL,
    messaggio TEXT NOT NULL,
    tipo VARCHAR(50) DEFAULT 'info', -- info, warning, error, success
    priorita VARCHAR(20) DEFAULT 'normale', -- alta, normale, bassa
    letto BOOLEAN DEFAULT false,
    data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_lettura TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    azione_link VARCHAR(255) NULL, -- Link per azione (opzionale)
    azione_testo VARCHAR(100) NULL  -- Testo del link azione (opzionale)
);

-- Indici per performance alerts
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_letto ON alerts(user_id, letto);
CREATE INDEX idx_alerts_data ON alerts(user_id, data_creazione);

-- ==============================================================================
-- 9. FUNZIONI STORED PROCEDURE
-- ==============================================================================

-- Funzione per calcolare saldo corrente
CREATE OR REPLACE FUNCTION calcola_saldo_conto(conto_id_param INTEGER)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    saldo_iniziale_var DECIMAL(15,2);
    saldo_movimenti DECIMAL(15,2);
BEGIN
    -- Ottieni saldo iniziale
    SELECT cc.saldo_iniziale INTO saldo_iniziale_var
    FROM conti_correnti cc
    WHERE cc.id = conto_id_param;
    
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
    
    RETURN COALESCE(saldo_iniziale_var, 0) + COALESCE(saldo_movimenti, 0);
END;
$$ LANGUAGE plpgsql;

-- Funzione per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Funzione per sincronizzare tipo_movimento_preferito con tipologia
CREATE OR REPLACE FUNCTION sync_anagrafica_tipo_movimento()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipologia_id IS NOT NULL THEN
        SELECT tipo_movimento_default INTO NEW.tipo_movimento_preferito
        FROM tipologie_anagrafiche 
        WHERE id = NEW.tipologia_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 10. TRIGGER PER UPDATED_AT
-- ==============================================================================

-- Trigger per utenti
CREATE TRIGGER update_utenti_updated_at BEFORE UPDATE ON utenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per conti correnti
CREATE TRIGGER update_conti_updated_at BEFORE UPDATE ON conti_correnti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per tipologie anagrafiche
CREATE TRIGGER update_tipologie_anagrafiche_updated_at BEFORE UPDATE ON tipologie_anagrafiche
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per categorie anagrafiche
CREATE TRIGGER update_categorie_anagrafiche_updated_at BEFORE UPDATE ON categorie_anagrafiche
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per categorie movimenti
CREATE TRIGGER update_categorie_movimenti_updated_at BEFORE UPDATE ON categorie_movimenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per anagrafiche
CREATE TRIGGER update_anagrafiche_updated_at BEFORE UPDATE ON anagrafiche
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per sincronizzazione tipo movimento nelle anagrafiche
CREATE TRIGGER sync_anagrafica_tipo_movimento_trigger 
    BEFORE INSERT OR UPDATE ON anagrafiche
    FOR EACH ROW EXECUTE FUNCTION sync_anagrafica_tipo_movimento();

-- Trigger per movimenti
CREATE TRIGGER update_movimenti_updated_at BEFORE UPDATE ON movimenti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger per alerts
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ESEGUI questa query nel tuo database PostgreSQL
-- È l'UNICO constraint che manca per risolvere i problemi di import

ALTER TABLE conti_correnti 
ADD CONSTRAINT conti_correnti_user_id_nome_banca_key 
UNIQUE (user_id, nome_banca);

-- ==============================================================================
-- 11. DATI DI ESEMPIO
-- ==============================================================================

-- Utenti
INSERT INTO utenti (username, password_hash, email) VALUES
('admin', '$2b$10$yxaU3JOqC8dpeH8fLFtRWOAzzNvqTNQNF44GcPIxWtct6B54HEEuK', 'admin@example.com'),
('demo', '$2b$10$7gusA60TTbNH2RMgwdGm0.3ZYMAtgLG2CTsLMuFF8nSuH4kCmtwrO', 'demo@example.com');

-- Tipologie Anagrafiche di default per utente admin
INSERT INTO tipologie_anagrafiche (user_id, nome, descrizione, tipo_movimento_default, colore, icona) VALUES
(1, 'Cliente Premium', 'Clienti di alto valore e frequenti', 'Entrata', '#10B981', 'star'),
(1, 'Cliente Standard', 'Clienti regolari', 'Entrata', '#3B82F6', 'user'),
(1, 'Cliente Occasionale', 'Clienti sporadici', 'Entrata', '#06B6D4', 'users'),
(1, 'Fornitore Materiali', 'Fornitori di beni e materiali', 'Uscita', '#F59E0B', 'truck'),
(1, 'Fornitore Servizi', 'Fornitori di servizi professionali', 'Uscita', '#EC4899', 'briefcase'),
(1, 'Consulente', 'Professionisti esterni che fatturano o vengono pagati', 'Entrambi', '#8B5CF6', 'user-tie'),
(1, 'Dipendente', 'Personale interno - solo uscite per stipendi', 'Uscita', '#6B7280', 'user-check'),
(1, 'Banca/Istituto', 'Banche e istituti finanziari', 'Entrambi', '#1F2937', 'building-bank'),
(1, 'Ente Pubblico', 'Pubblica amministrazione, comune, regione', 'Entrambi', '#059669', 'landmark'),
(1, 'Partner/Rivenditore', 'Partner commerciali e rivenditori', 'Entrata', '#DC2626', 'handshake');

-- Categorie anagrafiche di default per utente admin
INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) VALUES
(1, 'VIP', 'Anagrafiche prioritarie', '#10B981'),
(1, 'Locale', 'Anagrafiche della zona', '#3B82F6'),
(1, 'Nazionale', 'Anagrafiche nazionali', '#F59E0B'),
(1, 'Internazionale', 'Anagrafiche estere', '#EC4899'),
(1, 'Strategico', 'Partner strategici', '#8B5CF6'),
(1, 'Operativo', 'Fornitori operativi', '#06B6D4');

-- Categorie movimenti di default per utente admin
INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore) VALUES
(1, 'Vendite Prodotti', 'Entrata', 'Ricavi da vendita prodotti', '#10B981'),
(1, 'Vendite Servizi', 'Entrata', 'Ricavi da prestazioni di servizi', '#06B6D4'),
(1, 'Consulenze', 'Entrambi', 'Ricavi da attività di consulenza', '#3B82F6'),
(1, 'Commissioni', 'Entrata', 'Provvigioni e commissioni', '#8B5CF6'),
(1, 'Rimborsi', 'Entrata', 'Rimborsi e restituzioni', '#10B981'),
(1, 'Acquisti Materiali', 'Uscita', 'Acquisto di materiali e forniture', '#F59E0B'),
(1, 'Spese Operative', 'Uscita', 'Costi operativi generali', '#EF4444'),
(1, 'Stipendi', 'Uscita', 'Pagamenti stipendi e compensi', '#6B7280'),
(1, 'Consulenza Esterna', 'Uscita', 'Pagamenti per consulenze', '#EC4899'),
(1, 'Utenze', 'Uscita', 'Pagamenti utenze e bollette', '#84CC16'),
(1, 'Marketing', 'Uscita', 'Spese per marketing e pubblicità', '#F97316'),
(1, 'Formazione', 'Uscita', 'Corsi e formazione', '#8B5CF6');

-- Conti correnti di esempio
INSERT INTO conti_correnti (nome_banca, intestatario, iban, saldo_iniziale, user_id) VALUES
('Intesa Sanpaolo', 'Studio Professionale Admin', 'IT60X0542811101000000123456', 8500.00, 1),
('UniCredit Business', 'Studio Professionale Admin', 'IT45R0300203280284975791020', 4200.00, 1),
('Fineco Conto Cassa', 'Studio Professionale Admin', 'IT76P0760103200000001234567', 1800.00, 1);

-- Anagrafiche di esempio
INSERT INTO anagrafiche (nome, tipologia_id, categoria, email, telefono, piva, user_id) VALUES
-- Clienti Premium
('Azienda Leader SRL', 1, 'VIP', 'amministrazione@aziendaleader.it', '0123456789', '12345678901', 1),
('Multinazionale Corp', 1, 'Internazionale', 'finance@multinazionale.com', '0234567890', '23456789012', 1),
-- Clienti Standard  
('Negozio Centro SpA', 2, 'Locale', 'contabilita@negoziocentro.it', '0345678901', '34567890123', 1),
('Servizi Digitali SRL', 2, 'Nazionale', 'info@servizidigitali.it', '0456789012', '45678901234', 1),
-- Fornitori Materiali
('Forniture Ufficio SNC', 4, 'Operativo', 'ordini@fornitureufficio.it', '0567890123', '56789012345', 1),
('Tecnologie Hardware', 4, 'Strategico', 'vendite@techhard.it', '0678901234', '67890123456', 1),
-- Consulenti
('Dott. Marco Consulenza', 6, 'VIP', 'marco@consulenza.it', '3331234567', '78901234567', 1),
('Studio Legale Partners', 6, 'Strategico', 'info@studiolegale.it', '0789012345', '89012345678', 1),
-- Dipendenti
('Rossi Mario', 7, NULL, 'mario.rossi@email.it', '3339876543', NULL, 1),
('Bianchi Laura', 7, NULL, 'laura.bianchi@email.it', '3348765432', NULL, 1),
-- Enti/Banche
('Banca Nazionale', 8, 'Strategico', 'business@bancanazionale.it', '800123456', '90123456789', 1),
('Comune di Roma', 9, NULL, 'tributi@comune.roma.it', '06123456', NULL, 1);

-- Movimenti di esempio
INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note, user_id) VALUES
-- Entrate da clienti
('2024-12-01', 1, 1, 'Fattura 001/2024 - Consulenza strategica', 'Consulenze', 2500.00, 'Entrata', 'Progetto Q4 2024', 1),
('2024-12-02', 2, 1, 'Fattura 002/2024 - Servizi IT', 'Vendite Servizi', 4200.00, 'Entrata', 'Contratto annuale', 1),
('2024-12-03', 3, 2, 'Fattura 003/2024 - Vendita software', 'Vendite Prodotti', 800.00, 'Entrata', 'Licenza software', 1),
('2024-12-05', 4, 1, 'Fattura 004/2024 - Sviluppo web', 'Vendite Servizi', 1800.00, 'Entrata', 'Sito web aziendale', 1),
-- Entrate da consulenti
('2024-12-04', 7, 2, 'Fattura consulente - Progetto ABC', 'Consulenze', 1200.00, 'Entrata', 'Collaborazione esterna', 1),
-- Uscite fornitori
('2024-12-06', 5, 1, 'Fattura FOR-123 - Materiali ufficio', 'Acquisti Materiali', 450.00, 'Uscita', 'Cancelleria e stampanti', 1),
('2024-12-07', 6, 1, 'Fattura TECH-456 - Server', 'Acquisti Materiali', 2800.00, 'Uscita', 'Upgrade infrastruttura', 1),
-- Uscite consulenti
('2024-12-08', 8, 2, 'Fattura studio legale - Consulenza', 'Consulenza Esterna', 800.00, 'Uscita', 'Contratti commerciali', 1),
-- Stipendi dipendenti
('2024-12-10', 9, 1, 'Stipendio dicembre 2024', 'Stipendi', 2200.00, 'Uscita', 'Stipendio + contributi', 1),
('2024-12-10', 10, 1, 'Stipendio dicembre 2024', 'Stipendi', 1900.00, 'Uscita', 'Stipendio + contributi', 1),
-- Banche/Enti
('2024-12-12', 11, 1, 'Interessi attivi trimestre', 'Commissioni', 85.00, 'Entrata', 'Interessi conto deposito', 1),
('2024-12-12', 11, 1, 'Commissioni bancarie', 'Spese Operative', 25.00, 'Uscita', 'Spese trimestrali', 1),
('2024-12-15', 12, 2, 'Pagamento TARI 2024', 'Spese Operative', 320.00, 'Uscita', 'Tassa rifiuti', 1),
-- Altri movimenti vari
('2024-12-18', 1, 3, 'Acconto fattura 005/2025', 'Consulenze', 1500.00, 'Entrata', 'Acconto nuovo progetto', 1),
('2024-12-20', 5, 2, 'Acquisto mobili ufficio', 'Acquisti Materiali', 1200.00, 'Uscita', 'Scrivania e sedie', 1);

-- Alerts di esempio
INSERT INTO alerts (user_id, titolo, messaggio, tipo, priorita) VALUES
(1, 'Benvenuto!', 'Benvenuto nel sistema Prima Nota. Inizia creando le tue prime anagrafiche.', 'success', 'normale'),
(1, 'Backup consigliato', 'È consigliabile effettuare un backup periodico dei dati contabili.', 'info', 'bassa');

-- ==============================================================================
-- 12. VISTE PER REPORT
-- ==============================================================================

-- Vista per saldi conti
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

-- Vista dettaglio movimenti
CREATE VIEW v_movimenti_dettaglio AS
SELECT 
    m.id,
    m.data,
    a.nome as anagrafica_nome,
    ta.nome as tipologia_nome,
    ta.tipo_movimento_default as tipologia_movimento,
    a.tipo_movimento_preferito,
    a.categoria as anagrafica_categoria,
    cc.nome_banca,
    m.descrizione,
    m.categoria as movimento_categoria,
    m.importo,
    m.tipo,
    m.note,
    m.created_at,
    m.user_id
FROM movimenti m
LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
ORDER BY m.data DESC, m.created_at DESC;

-- Vista completa movimenti con colori categorie
CREATE VIEW vista_movimenti_completa AS
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
    ta.nome as tipologia_nome,
    ta.tipo_movimento_default as tipologia_movimento,
    ta.colore as tipologia_colore,
    ta.icona as tipologia_icona,
    a.categoria as anagrafica_categoria,
    cc.nome_banca,
    cc.intestatario,
    cm.colore as categoria_movimento_colore,
    ca.colore as anagrafica_categoria_colore,
    m.created_at,
    m.updated_at
FROM movimenti m
LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
LEFT JOIN categorie_movimenti cm ON m.categoria = cm.nome AND m.user_id = cm.user_id
LEFT JOIN categorie_anagrafiche ca ON a.categoria = ca.nome AND a.user_id = ca.user_id;

-- ==============================================================================
-- 13. COMMENTI DOCUMENTAZIONE
-- ==============================================================================
COMMENT ON TABLE tipologie_anagrafiche IS 'Tipologie personalizzabili per anagrafiche (es: Cliente Premium, Consulente, etc.)';
COMMENT ON TABLE anagrafiche IS 'Anagrafiche con tipologie flessibili invece di Cliente/Fornitore fissi';
COMMENT ON COLUMN tipologie_anagrafiche.tipo_movimento_default IS 'Tipo movimento predefinito: Entrata, Uscita o Entrambi';
COMMENT ON COLUMN tipologie_anagrafiche.icona IS 'Nome icona per UI (user, building, truck, etc.)';
COMMENT ON COLUMN anagrafiche.tipo_movimento_preferito IS 'Cache del tipo movimento della tipologia per query più veloci';

-- ==============================================================================
-- VERIFICA INSTALLAZIONE
-- ==============================================================================

DO $$ 
BEGIN
    RAISE NOTICE 'Prima Nota Contabile - Database FLESSIBILE inizializzato con successo!';
    RAISE NOTICE 'Versione: 3.1 - Tipologie Anagrafiche Personalizzabili (CORRETTA)';
    RAISE NOTICE 'Tabelle create: utenti, conti_correnti, tipologie_anagrafiche, categorie_anagrafiche, anagrafiche, categorie_movimenti, movimenti, alerts';
    RAISE NOTICE 'Utente di test: admin / password123, demo / password';
    RAISE NOTICE 'Tipologie esempio: Cliente Premium, Fornitore Servizi, Consulente, Dipendente, Banca, Ente Pubblico';
END $$;

SELECT 'Database flessibile creato con successo!' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;