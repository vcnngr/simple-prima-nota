-- ==============================================================================
-- 007 — La chat diventa uno strumento di lavoro (blocco W5)
-- ==============================================================================
-- Tre aggiunte a messaggi_commercialista:
--   1. riferimento opzionale a un movimento del cliente (`movimento_id`): la
--      domanda "cos'e' questo bonifico?" porta con se' il bonifico;
--   2. richieste di chiarimento con stato aperta/risolta, cosi' che "mancano i
--      documenti di marzo" non si perda dopo venti messaggi;
--   3. allegati: metadati qui, contenuto su disco (ALLEGATI_DIR), mai nel DB.
--
-- Il nome del file su disco e' una chiave casuale generata dal server: il nome
-- scelto da chi carica resta solo un'etichetta e non tocca mai il filesystem.
--
-- Quando un allegato sparisce (in cascata con il messaggio, il collegamento o
-- l'account) il file non puo' sparire nella stessa transazione: un trigger mette
-- la chiave in `allegati_da_rimuovere` e il backend cancella i file da li'.
-- Senza, cancellare l'account lascerebbe i documenti del cliente sul disco.
--
-- Il download di un allegato da parte del commercialista e' un accesso ai dati
-- del cliente: nuovo tipo 'allegato' nel registro della 005.
--
-- Rollback in 007_chat_lavoro_down.sql.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Movimento di riferimento e richieste di chiarimento
-- ------------------------------------------------------------------------------
ALTER TABLE messaggi_commercialista
  -- SET NULL: se il cliente cancella il movimento, il messaggio resta.
  ADD COLUMN IF NOT EXISTS movimento_id INTEGER
      REFERENCES movimenti(id) ON DELETE SET NULL,
  -- NULL = messaggio normale.
  ADD COLUMN IF NOT EXISTS chiarimento_stato VARCHAR(10)
      CHECK (chiarimento_stato IN ('aperta','risolta')),
  ADD COLUMN IF NOT EXISTS chiarimento_risolto_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS chiarimento_risolto_da VARCHAR(20)
      CHECK (chiarimento_risolto_da IN ('user','commercialista'));

CREATE INDEX IF NOT EXISTS idx_messaggi_movimento
  ON messaggi_commercialista (movimento_id) WHERE movimento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messaggi_chiarimenti_aperti
  ON messaggi_commercialista (collegamento_id) WHERE chiarimento_stato = 'aperta';

-- ------------------------------------------------------------------------------
-- Allegati
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS allegati_messaggio (
    id              SERIAL PRIMARY KEY,
    messaggio_id    INTEGER NOT NULL
        REFERENCES messaggi_commercialista(id) ON DELETE CASCADE,
    -- Etichetta mostrata e proposta al download, gia' ripulita dal backend.
    nome_originale  VARCHAR(255) NOT NULL,
    -- Tipo riconosciuto dal contenuto, non quello dichiarato dal browser.
    mime            VARCHAR(100) NOT NULL,
    dimensione      INTEGER NOT NULL CHECK (dimensione > 0),
    sha256          CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    -- Nome del file su disco: 32 esadecimali casuali, nient'altro. Il vincolo
    -- chiude ogni path traversal anche se un giorno il codice sbagliasse.
    chiave          VARCHAR(32) NOT NULL UNIQUE CHECK (chiave ~ '^[0-9a-f]{32}$'),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allegati_messaggio
  ON allegati_messaggio (messaggio_id);

-- File da cancellare dal disco. Il backend li prende e li rimuove.
CREATE TABLE IF NOT EXISTS allegati_da_rimuovere (
    chiave      VARCHAR(32) PRIMARY KEY CHECK (chiave ~ '^[0-9a-f]{32}$'),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION allegato_rimosso()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO allegati_da_rimuovere (chiave) VALUES (OLD.chiave)
    ON CONFLICT (chiave) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_allegato_rimosso ON allegati_messaggio;
CREATE TRIGGER trigger_allegato_rimosso
    AFTER DELETE ON allegati_messaggio
    FOR EACH ROW EXECUTE FUNCTION allegato_rimosso();

-- ------------------------------------------------------------------------------
-- Registro accessi: il download di un allegato
-- ------------------------------------------------------------------------------
ALTER TABLE accessi_commercialista
  DROP CONSTRAINT IF EXISTS accessi_commercialista_tipo_accesso_check;
ALTER TABLE accessi_commercialista
  ADD CONSTRAINT accessi_commercialista_tipo_accesso_check
  CHECK (tipo_accesso IN ('lista_clienti','dettaglio_cliente','export','chat',
                          'disconnessione','allegato'));

COMMIT;
