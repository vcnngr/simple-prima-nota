-- ==============================================================================
-- 013 — rollback: tema e aspetto sull'account
-- ==============================================================================
-- Toglie le colonne (con i loro CHECK). Le scelte fatte vanno perse: dopo una
-- riapplicazione tutti gli account ripartono dai predefiniti.
-- ==============================================================================

BEGIN;

ALTER TABLE commercialisti DROP COLUMN IF EXISTS aspetto, DROP COLUMN IF EXISTS tema;
ALTER TABLE utenti DROP COLUMN IF EXISTS aspetto, DROP COLUMN IF EXISTS tema;

COMMIT;
