-- ==============================================================================
-- 015 — Estratti conto della banca (blocco U9a)
-- ==============================================================================
-- Il cliente carica l'estratto conto della banca su un suo conto: ogni riga
-- della banca si abbina a un movimento gia' nel Registro oppure diventa un
-- movimento nuovo «da descrivere» (richiesta del commercialista, 22/11/2026:
-- l'estratto e' l'elenco di controllo, nessun movimento «bucato»).
--
--   * modelli_estratto   com'e' fatto il file di una banca (colonne, formati),
--                        riconosciuto dall'impronta dell'intestazione. Condiviso
--                        fra tutti gli utenti: contiene solo nomi di colonne e
--                        formati, mai dati. Proposto, mai applicato senza anteprima;
--   * estratti_conto     un file caricato (conto, periodo, saldi letti dal file);
--   * righe_estratto     le righe della banca. `impronta` (giorno, importo con
--                        segno, descrizione normalizzata, ordinale fra righe
--                        identiche) e' unica per conto: un estratto che si
--                        sovrappone al precedente non crea doppioni;
--                        `movimento_id` = il movimento abbinato o creato;
--   * movimenti.da_descrivere  creato dall'estratto e non ancora descritto dal
--                        cliente; si spegne alla prima modifica del cliente.
--
-- Rollback in 015_estratti_conto_down.sql.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS modelli_estratto (
    id SERIAL PRIMARY KEY,
    firma CHAR(64) NOT NULL UNIQUE,            -- sha256 dell'intestazione normalizzata
    nome VARCHAR(100) NOT NULL,                -- «Fineco», «Intesa Sanpaolo»...
    mappa JSONB NOT NULL,                      -- colonne e formati (vedi services/estratti)
    creato_da INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
    usi INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT modelli_estratto_mappa_oggetto CHECK (jsonb_typeof(mappa) = 'object')
);

CREATE TABLE IF NOT EXISTS estratti_conto (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    conto_id INTEGER NOT NULL REFERENCES conti_correnti(id) ON DELETE CASCADE,
    modello_id INTEGER REFERENCES modelli_estratto(id) ON DELETE SET NULL,
    nome_file VARCHAR(255) NOT NULL,
    formato VARCHAR(16) NOT NULL CHECK (formato IN ('csv', 'xlsx', 'camt053')),
    dal DATE NOT NULL,
    al DATE NOT NULL,
    saldo_iniziale DECIMAL(15,2),              -- dal file, se c'e'
    saldo_finale DECIMAL(15,2),
    righe INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT estratti_conto_periodo CHECK (dal <= al)
);
CREATE INDEX IF NOT EXISTS idx_estratti_conto_user ON estratti_conto (user_id, conto_id, al DESC);

CREATE TABLE IF NOT EXISTS righe_estratto (
    id SERIAL PRIMARY KEY,
    estratto_id INTEGER NOT NULL REFERENCES estratti_conto(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
    conto_id INTEGER NOT NULL REFERENCES conti_correnti(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    data_valuta DATE,
    descrizione TEXT NOT NULL,                 -- testo della banca, com'e'
    importo DECIMAL(15,2) NOT NULL CHECK (importo > 0),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Entrata', 'Uscita')),
    impronta CHAR(64) NOT NULL,
    movimento_id INTEGER REFERENCES movimenti(id) ON DELETE SET NULL,
    esito VARCHAR(16) NOT NULL CHECK (esito IN ('abbinata', 'creata')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT righe_estratto_impronta_unica UNIQUE (conto_id, impronta)
);
CREATE INDEX IF NOT EXISTS idx_righe_estratto_estratto ON righe_estratto (estratto_id, data, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_righe_estratto_movimento
  ON righe_estratto (movimento_id) WHERE movimento_id IS NOT NULL;

ALTER TABLE movimenti ADD COLUMN IF NOT EXISTS da_descrivere BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_movimenti_da_descrivere
  ON movimenti (user_id, data DESC) WHERE da_descrivere;

COMMIT;
