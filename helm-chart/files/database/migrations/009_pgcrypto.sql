-- ==============================================================================
-- 009 — Estensione pgcrypto (blocco S1)
-- ==============================================================================
-- genera_token_invito (001, riscritta dalla 003) usa gen_random_bytes(), che sta
-- in pgcrypto. init.sql di main e dei primi commit del branch non la installava:
-- sui database nati da li' la funzione si crea ma fallisce alla prima chiamata
-- ("function gen_random_bytes(integer) does not exist").
--
-- Sta in una migrazione nuova, non nella 001: sui database anteriori a migra.sh
-- la 001 viene riconosciuta dallo schema e non rieseguita, quindi una correzione
-- dentro la 001 non arriverebbe mai proprio ai database che ne hanno bisogno.
--
-- Rollback in 009_pgcrypto_down.sql.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

COMMIT;
