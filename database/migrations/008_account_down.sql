-- ==============================================================================
-- 008 down — rollback di cambio password/email e reset
-- ==============================================================================
-- Toglie i token e la versione delle credenziali. Le password cambiate o
-- reimpostate restano quelle nuove (sono in password_hash, che il rollback non
-- tocca), cosi' come gli indirizzi email confermati.
--
-- ATTENZIONE: il middleware pre-008 non guarda il claim `cv`. Dopo il rollback
-- tornano validi, fino alla scadenza naturale (24 h utenti, 7 giorni studi),
-- anche i JWT che un cambio o reset della password aveva chiuso. Se il rollback
-- segue un furto di credenziali, cambiare JWT_SECRET per chiudere tutto.
-- ==============================================================================

BEGIN;

DROP INDEX IF EXISTS uq_commercialisti_email_lower;
DROP INDEX IF EXISTS uq_utenti_email_lower;
DROP TABLE IF EXISTS token_account;
ALTER TABLE commercialisti DROP COLUMN IF EXISTS versione_credenziali;
ALTER TABLE utenti DROP COLUMN IF EXISTS versione_credenziali;

COMMIT;
