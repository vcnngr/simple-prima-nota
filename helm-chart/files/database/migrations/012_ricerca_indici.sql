-- ==============================================================================
-- 012 — Ricerca e paginazione (fase UX, blocco U1)
-- ==============================================================================
-- Il selettore della controparte cerca sul server, con un tetto, anche fra
-- migliaia di anagrafiche: `nome ILIKE '%...%'` senza indice legge tutta la
-- tabella a ogni tasto. pg_trgm rende indicizzabile il LIKE con % iniziale.
--
--   * idx_anagrafiche_nome_trgm   LIKE/ILIKE su lower(nome) (GIN, trigrammi);
--   * idx_anagrafiche_user_nome   elenco per utente in ordine alfabetico, con
--                                 l'id come spareggio (paginazione stabile);
--   * idx_movimenti_user_data_id  lista dei movimenti per data con spareggio
--                                 sull'id (cursore) e "uso recente" delle
--                                 controparti;
--   * idx_movimenti_conto_data_id saldo progressivo per conto.
--
-- pg_trgm e' "trusted" da PostgreSQL 13: la crea anche il proprietario del
-- database senza superuser (CloudNativePG).
-- Rollback in 012_ricerca_indici_down.sql.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_anagrafiche_nome_trgm
  ON anagrafiche USING gin (lower(nome) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_user_nome
  ON anagrafiche (user_id, lower(nome), id);
CREATE INDEX IF NOT EXISTS idx_movimenti_user_data_id
  ON movimenti (user_id, data DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_movimenti_conto_data_id
  ON movimenti (conto_id, data, id);

COMMIT;
