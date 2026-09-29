-- ==============================================================================
-- 010 — rollback: eliminazione dell'account di uno studio
-- ==============================================================================
-- Torna la FK in CASCADE e username/email obbligatori. Gli studi gia' eliminati
-- non tornano quelli di prima (i dati di contatto sono stati tolti): restano con
-- username '#eliminato-<id>', email '#eliminato-<id>@eliminato.invalid' e password
-- inutilizzabile, cioe' non possono accedere. Riapplicando la 010 tornano
-- eliminati. Se un account vivo usasse gia' quei valori, il rollback si ferma
-- (vincolo unico) e non cambia nulla.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS elimina_account_commercialista(INTEGER);

UPDATE commercialisti
   SET username = '#eliminato-' || id,
       email = '#eliminato-' || id || '@eliminato.invalid'
 WHERE eliminato_il IS NOT NULL;

ALTER TABLE commercialisti DROP CONSTRAINT IF EXISTS chk_commercialisti_vivo_identificato;
ALTER TABLE commercialisti ALTER COLUMN username SET NOT NULL;
ALTER TABLE commercialisti ALTER COLUMN email SET NOT NULL;
ALTER TABLE commercialisti DROP COLUMN IF EXISTS eliminato_il;

ALTER TABLE collegamenti_commercialista
  DROP CONSTRAINT IF EXISTS collegamenti_commercialista_commercialista_id_fkey;
ALTER TABLE collegamenti_commercialista
  ADD CONSTRAINT collegamenti_commercialista_commercialista_id_fkey
  FOREIGN KEY (commercialista_id) REFERENCES commercialisti(id) ON DELETE CASCADE;

COMMIT;
