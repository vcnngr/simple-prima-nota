-- ==============================================================================
-- 013 — Tema e aspetto sull'account (fase UX, blocco U2)
-- ==============================================================================
-- Il nuovo frontend ha due temi (Registro, Bottega) e tre aspetti (chiaro,
-- scuro, automatico = quello del sistema). La scelta segue l'account, non il
-- browser: stessa colonna su `utenti` e su `commercialisti`. Il frontend ne
-- tiene una copia locale solo per disegnare la prima pagina senza sfarfallio.
--
-- Valori fissi (CHECK): un tema nuovo e' una migrazione nuova. Predefiniti
-- registro / automatico, anche per gli account nati prima della 013.
-- Rollback in 013_preferenze_aspetto_down.sql.
-- ==============================================================================

BEGIN;

ALTER TABLE utenti
  ADD COLUMN IF NOT EXISTS tema VARCHAR(16) NOT NULL DEFAULT 'registro'
    CONSTRAINT utenti_tema_valido CHECK (tema IN ('registro', 'bottega')),
  ADD COLUMN IF NOT EXISTS aspetto VARCHAR(16) NOT NULL DEFAULT 'automatico'
    CONSTRAINT utenti_aspetto_valido CHECK (aspetto IN ('chiaro', 'scuro', 'automatico'));

ALTER TABLE commercialisti
  ADD COLUMN IF NOT EXISTS tema VARCHAR(16) NOT NULL DEFAULT 'registro'
    CONSTRAINT commercialisti_tema_valido CHECK (tema IN ('registro', 'bottega')),
  ADD COLUMN IF NOT EXISTS aspetto VARCHAR(16) NOT NULL DEFAULT 'automatico'
    CONSTRAINT commercialisti_aspetto_valido CHECK (aspetto IN ('chiaro', 'scuro', 'automatico'));

COMMIT;
