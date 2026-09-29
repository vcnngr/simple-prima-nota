-- ==============================================================================
-- 012 — rollback: indici di ricerca e paginazione
-- ==============================================================================
-- Toglie gli indici. pg_trgm resta: potrebbe averla installata qualcun altro
-- prima della 012 (CREATE EXTENSION IF NOT EXISTS non lo dice), e toglierla
-- romperebbe i suoi indici. Senza indici che la usano non costa nulla.
-- ==============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_movimenti_conto_data_id;
DROP INDEX IF EXISTS idx_movimenti_user_data_id;
DROP INDEX IF EXISTS idx_anagrafiche_user_nome;
DROP INDEX IF EXISTS idx_anagrafiche_nome_trgm;

COMMIT;
