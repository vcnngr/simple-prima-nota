-- ==============================================================================
-- 014 — rollback: vista dell'Estratto sull'account
-- ==============================================================================
-- Toglie la colonna (con il suo CHECK). Le scelte vanno perse: dopo una
-- riapplicazione tutti gli account ripartono da `due_righe`.
-- ==============================================================================

BEGIN;

ALTER TABLE commercialisti DROP COLUMN IF EXISTS vista_estratto;
ALTER TABLE utenti DROP COLUMN IF EXISTS vista_estratto;

COMMIT;
