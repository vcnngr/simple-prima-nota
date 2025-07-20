-- ==============================================================================
-- FILE: database/migrations/add_categories_system.sql
-- POSIZIONE: Esegui direttamente nel database PostgreSQL
-- ==============================================================================

-- 1. Creazione tabella categorie anagrafiche
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

-- 2. Creazione tabella categorie movimenti
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

-- 3. Aggiunta colonna categoria ai movimenti
ALTER TABLE movimenti ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);

-- 4. Creazione indici per performance
CREATE INDEX IF NOT EXISTS idx_categorie_anagrafiche_user_id ON categorie_anagrafiche(user_id);
CREATE INDEX IF NOT EXISTS idx_categorie_anagrafiche_nome ON categorie_anagrafiche(user_id, nome);
CREATE INDEX IF NOT EXISTS idx_categorie_movimenti_user_id ON categorie_movimenti(user_id);
CREATE INDEX IF NOT EXISTS idx_categorie_movimenti_tipo ON categorie_movimenti(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_movimenti_categoria ON movimenti(categoria);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_categoria ON anagrafiche(categoria);

-- 5. Inserimento categorie di default per tutti gli utenti esistenti
INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT DISTINCT id, 'Generale', 'Categoria generale per anagrafiche', '#6B7280' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT DISTINCT id, 'Clienti Premium', 'Clienti di alto valore', '#10B981' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore) 
SELECT DISTINCT id, 'Fornitori Principali', 'Fornitori strategici', '#F59E0B' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT DISTINCT id, 'Generale', 'Entrambi', 'Categoria generale per movimenti', '#6B7280' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT DISTINCT id, 'Vendite', 'Entrata', 'Ricavi da vendite', '#10B981' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT DISTINCT id, 'Spese Operative', 'Uscita', 'Costi operativi', '#EF4444' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
SELECT DISTINCT id, 'Stipendi', 'Uscita', 'Pagamenti stipendi', '#8B5CF6' 
FROM utenti
ON CONFLICT (user_id, nome) DO NOTHING;

-- 6. Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ language 'plpgsql';

-- Applica trigger alle tabelle categorie
CREATE TRIGGER update_categorie_anagrafiche_updated_at 
    BEFORE UPDATE ON categorie_anagrafiche 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorie_movimenti_updated_at 
    BEFORE UPDATE ON categorie_movimenti 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Commenti per documentazione
COMMENT ON TABLE categorie_anagrafiche IS 'Categorie personalizzabili per anagrafiche';
COMMENT ON TABLE categorie_movimenti IS 'Categorie personalizzabili per movimenti';
COMMENT ON COLUMN categorie_anagrafiche.colore IS 'Colore hex per UI (#RRGGBB)';
COMMENT ON COLUMN categorie_movimenti.tipo IS 'Tipo movimento: Entrata, Uscita o Entrambi';

-- Fine migrazione