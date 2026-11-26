-- ==============================================================================
-- 016 — Estratti conto anche in PDF (blocco U9c)
-- ==============================================================================
-- Il lettore degli estratti accetta il PDF della banca (estratto trimestrale,
-- lista movimenti): `estratti_conto.formato` ammette 'pdf'.
-- Rollback in 016_estratti_pdf_down.sql.
-- ==============================================================================

BEGIN;

ALTER TABLE estratti_conto DROP CONSTRAINT IF EXISTS estratti_conto_formato_check;
ALTER TABLE estratti_conto ADD CONSTRAINT estratti_conto_formato_check
  CHECK (formato IN ('csv', 'xlsx', 'camt053', 'pdf'));

COMMIT;
