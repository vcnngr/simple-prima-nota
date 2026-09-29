-- ==============================================================================
-- 007 down — rollback della chat di lavoro
-- ==============================================================================
-- Toglie allegati, riferimento al movimento e richieste di chiarimento, e riporta
-- il registro accessi ai tipi della 005.
--
-- ATTENZIONE: i file degli allegati restano su disco (ALLEGATI_DIR). Il rollback
-- non li puo' cancellare: vanno rimossi a mano se il rollback e' definitivo.
--
-- Le righe 'allegato' del registro non rientrano nel vincolo della 005: vanno
-- tolte, e il registro non si lascia cancellare (trigger della 005). Qui, e solo
-- qui, il trigger si sospende per la durata della transazione.
-- ==============================================================================

BEGIN;

ALTER TABLE accessi_commercialista DISABLE TRIGGER trigger_accessi_immutabile;
DELETE FROM accessi_commercialista WHERE tipo_accesso = 'allegato';
ALTER TABLE accessi_commercialista ENABLE TRIGGER trigger_accessi_immutabile;

ALTER TABLE accessi_commercialista
  DROP CONSTRAINT IF EXISTS accessi_commercialista_tipo_accesso_check;
ALTER TABLE accessi_commercialista
  ADD CONSTRAINT accessi_commercialista_tipo_accesso_check
  CHECK (tipo_accesso IN ('lista_clienti','dettaglio_cliente','export','chat','disconnessione'));

DROP TRIGGER IF EXISTS trigger_allegato_rimosso ON allegati_messaggio;
DROP FUNCTION IF EXISTS allegato_rimosso();
DROP TABLE IF EXISTS allegati_da_rimuovere;
DROP TABLE IF EXISTS allegati_messaggio;

DROP INDEX IF EXISTS idx_messaggi_chiarimenti_aperti;
DROP INDEX IF EXISTS idx_messaggi_movimento;
ALTER TABLE messaggi_commercialista
  DROP COLUMN IF EXISTS chiarimento_risolto_da,
  DROP COLUMN IF EXISTS chiarimento_risolto_at,
  DROP COLUMN IF EXISTS chiarimento_stato,
  DROP COLUMN IF EXISTS movimento_id;

COMMIT;
