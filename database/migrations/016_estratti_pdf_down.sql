-- ==============================================================================
-- 016 — rollback: estratti conto in PDF
-- ==============================================================================
-- Torna il vincolo della 015. Gli estratti gia' caricati da PDF restano (righe e
-- movimenti compresi): il vincolo si rimette NOT VALID, vale per le righe nuove.
-- ==============================================================================

BEGIN;

ALTER TABLE estratti_conto DROP CONSTRAINT IF EXISTS estratti_conto_formato_check;
ALTER TABLE estratti_conto ADD CONSTRAINT estratti_conto_formato_check
  CHECK (formato IN ('csv', 'xlsx', 'camt053')) NOT VALID;

COMMIT;
