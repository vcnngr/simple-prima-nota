-- ==============================================================================
-- 014 — Vista dell'Estratto sull'account (fase UX, blocco U4)
-- ==============================================================================
-- La riga dell'Estratto ha quattro disegni (decisione del titolare, 09/10/2026),
-- scelti per account come il tema (013):
--
--   due_righe  A: controparte e descrizione, importo e saldo sotto (predefinita);
--   colonne    B: importo e saldo in due colonne, filetto colorato;
--   iniziali   C: iniziale della controparte, categoria, saldo a fine giornata;
--   mastro     D: libro mastro, giorno a margine e colonna del saldo.
--
-- Stessa colonna su `utenti` e `commercialisti` (lo studio vede gli estratti dei
-- clienti, U6). Valori fissi (CHECK): una vista nuova e' una migrazione nuova.
-- Rollback in 014_vista_estratto_down.sql.
-- ==============================================================================

BEGIN;

ALTER TABLE utenti
  ADD COLUMN IF NOT EXISTS vista_estratto VARCHAR(16) NOT NULL DEFAULT 'due_righe'
    CONSTRAINT utenti_vista_estratto_valida
    CHECK (vista_estratto IN ('due_righe', 'colonne', 'iniziali', 'mastro'));

ALTER TABLE commercialisti
  ADD COLUMN IF NOT EXISTS vista_estratto VARCHAR(16) NOT NULL DEFAULT 'due_righe'
    CONSTRAINT commercialisti_vista_estratto_valida
    CHECK (vista_estratto IN ('due_righe', 'colonne', 'iniziali', 'mastro'));

COMMIT;
