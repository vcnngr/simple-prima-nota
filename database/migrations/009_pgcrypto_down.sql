-- ==============================================================================
-- 009 down — pgcrypto
-- ==============================================================================
-- Non toglie l'estensione: l'init.sql attuale la crea gia' (prima della 009),
-- e senza di lei i token d'invito smettono di funzionare. Il rollback della 009
-- toglie solo la riga dal registro (lo fa migra.sh). Nulla da annullare qui.
-- ==============================================================================

SELECT 1;
