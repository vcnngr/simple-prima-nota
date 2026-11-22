-- ==============================================================================
-- 015 — rollback: estratti conto della banca
-- ==============================================================================
-- Toglie le tabelle degli estratti e la colonna `movimenti.da_descrivere`.
-- I movimenti creati dagli estratti RESTANO nel Registro (sono movimenti come gli
-- altri); si perdono solo il legame con la riga della banca, i modelli delle
-- banche e il segno «da descrivere».
-- ==============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_movimenti_da_descrivere;
ALTER TABLE movimenti DROP COLUMN IF EXISTS da_descrivere;
DROP TABLE IF EXISTS righe_estratto;
DROP TABLE IF EXISTS estratti_conto;
DROP TABLE IF EXISTS modelli_estratto;

COMMIT;
