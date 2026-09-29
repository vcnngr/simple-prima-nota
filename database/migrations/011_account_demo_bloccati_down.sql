-- ==============================================================================
-- 011 down — rimette le password pubblicate sugli account bloccati dalla 011
-- ==============================================================================
-- Solo dove l'hash e' ancora quello messo dal blocco: una password impostata
-- dopo da un amministratore resta. `versione_credenziali` non torna indietro
-- (i token annullati restano annullati), e nemmeno i link annullati.
-- ==============================================================================

BEGIN;

UPDATE utenti u
SET password_hash = b.hash_precedente
FROM account_demo_bloccati b
WHERE u.id = b.user_id AND u.password_hash = b.hash_blocco;

DROP TABLE account_demo_bloccati;

COMMIT;
