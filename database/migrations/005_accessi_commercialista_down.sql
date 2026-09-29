-- ==============================================================================
-- 005 DOWN — rimuove il registro degli accessi del commercialista
-- ==============================================================================
-- ATTENZIONE: cancella lo storico degli accessi. Idempotente.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS registra_accessi_elenco(INTEGER, VARCHAR);
DROP TABLE IF EXISTS accessi_commercialista;
DROP FUNCTION IF EXISTS accessi_commercialista_immutabile();
DROP INDEX IF EXISTS idx_collegamenti_id_coppia;

COMMIT;
