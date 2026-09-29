-- ==============================================================================
-- 008 — Account: cambio password ed email, reset via email (blocco W6)
-- ==============================================================================
-- Due aggiunte, identiche per utenti e commercialisti:
--
--   1. `versione_credenziali`: entra nel JWT (claim `cv`) e il middleware la
--      confronta a ogni richiesta. Cambio o reset della password la incrementano:
--      tutte le sessioni aperte altrove smettono di valere, compresa quella di chi
--      aveva rubato la password. I token emessi prima della 008 non hanno `cv` e
--      valgono come versione 0, finche' la password non cambia.
--
--   2. `token_account`: token monouso per il reset della password e per la
--      conferma di un nuovo indirizzo email. Nel database solo l'hash SHA-256;
--      il token in chiaro esiste solo nella mail. Un token vale se:
--        - non e' usato ne' annullato e non e' scaduto;
--        - la versione delle credenziali dell'account e' ancora quella che aveva
--          quando il token e' stato emesso (un cambio password lo spegne).
--      Al piu' un token attivo per account e scopo (indice unico parziale).
--
--   3. unicita' dell'email senza distinzione di maiuscole (indice unico su
--      lower(email)), per utenti e per commercialisti. Il vincolo UNIQUE
--      originale distingue `Mario@x.it` da `mario@x.it`: due conferme di cambio
--      email concorrenti potevano dare lo stesso indirizzo a due account, e il
--      reset (che cerca per lower(email)) ne avrebbe scelto uno a caso.
--      Se nel database ci sono gia' indirizzi che differiscono solo per le
--      maiuscole, la migration si ferma e dice quanti: vanno risolti a mano
--      (quale account tiene l'indirizzo e' una scelta, non un automatismo).
--
-- Rollback in 008_account_down.sql.
-- ==============================================================================

BEGIN;

ALTER TABLE utenti
  ADD COLUMN IF NOT EXISTS versione_credenziali INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commercialisti
  ADD COLUMN IF NOT EXISTS versione_credenziali INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS token_account (
    id SERIAL PRIMARY KEY,
    -- Esattamente uno dei due: il token segue l'account in cascata.
    user_id INTEGER REFERENCES utenti(id) ON DELETE CASCADE,
    commercialista_id INTEGER REFERENCES commercialisti(id) ON DELETE CASCADE,
    scopo VARCHAR(20) NOT NULL CHECK (scopo IN ('reset_password', 'conferma_email')),
    token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    nuova_email VARCHAR(100),
    versione_credenziali INTEGER NOT NULL,
    scadenza TIMESTAMPTZ NOT NULL,
    usato_il TIMESTAMPTZ,
    annullato_il TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT token_account_un_solo_account
      CHECK ((user_id IS NULL) <> (commercialista_id IS NULL)),
    CONSTRAINT token_account_email_se_conferma
      CHECK ((scopo = 'conferma_email') = (nuova_email IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_account_attivo_user
  ON token_account (user_id, scopo)
  WHERE user_id IS NOT NULL AND usato_il IS NULL AND annullato_il IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_account_attivo_commercialista
  ON token_account (commercialista_id, scopo)
  WHERE commercialista_id IS NOT NULL AND usato_il IS NULL AND annullato_il IS NULL;

DO $$
DECLARE n_u INTEGER; n_c INTEGER;
BEGIN
  SELECT count(*) INTO n_u FROM (SELECT 1 FROM utenti GROUP BY lower(email) HAVING count(*) > 1) d;
  SELECT count(*) INTO n_c FROM (SELECT 1 FROM commercialisti GROUP BY lower(email) HAVING count(*) > 1) d;
  IF n_u > 0 OR n_c > 0 THEN
    RAISE EXCEPTION '008: indirizzi email uguali a meno delle maiuscole (utenti: %, commercialisti: %). Risolverli prima di applicare la migration.', n_u, n_c;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_utenti_email_lower ON utenti (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercialisti_email_lower ON commercialisti (lower(email));

COMMIT;
