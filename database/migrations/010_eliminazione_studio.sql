-- ==============================================================================
-- 010 — Eliminazione dell'account di uno studio (blocco S3)
-- ==============================================================================
-- Prima: nessuna rotta eliminava uno studio, e un DELETE FROM commercialisti (a
-- mano, da uno script di pulizia) cancellava in cascata collegamenti, chat,
-- allegati, notifiche e il registro degli accessi. Cioe' dati del CLIENTE: la sua
-- corrispondenza con lo studio e la traccia di chi ha guardato i suoi conti.
--
-- Ora:
--   * eliminare uno studio = anonimizzarlo (elimina_account_commercialista):
--     collegamenti aperti revocati (il cliente riceve l'avviso della 006), sessioni
--     e link chiusi, notifiche per lo studio annullate, dati di contatto tolti,
--     username ed email liberati. Restano, per il cliente, la ragione sociale, la
--     chat, gli allegati e il registro degli accessi;
--   * il DELETE fisico di uno studio che ha avuto collegamenti e' rifiutato
--     (FK RESTRICT al posto di CASCADE): si fa solo di proposito, dopo aver deciso
--     che fine fanno i dati dei clienti.
--
-- Rollback in 010_eliminazione_studio_down.sql.
-- ==============================================================================

BEGIN;

ALTER TABLE commercialisti
  ADD COLUMN IF NOT EXISTS eliminato_il TIMESTAMP;

-- Lo studio eliminato non ha piu' username ne' email: tornano liberi e non
-- restano indirizzi di una persona che se ne e' andata. Un account vivo li ha.
ALTER TABLE commercialisti ALTER COLUMN username DROP NOT NULL;
ALTER TABLE commercialisti ALTER COLUMN email DROP NOT NULL;
-- Studi eliminati prima di un rollback della 010 (il down li lascia con
-- username '#eliminato-<id>' e password inutilizzabile): tornano eliminati.
UPDATE commercialisti
   SET eliminato_il = COALESCE(updated_at, NOW()), username = NULL, email = NULL
 WHERE eliminato_il IS NULL
   AND password_hash = '!'
   AND username = '#eliminato-' || id;
ALTER TABLE commercialisti DROP CONSTRAINT IF EXISTS chk_commercialisti_vivo_identificato;
ALTER TABLE commercialisti ADD CONSTRAINT chk_commercialisti_vivo_identificato
  CHECK (eliminato_il IS NOT NULL OR (username IS NOT NULL AND email IS NOT NULL));

-- collegamenti_commercialista.commercialista_id: CASCADE -> RESTRICT.
DO $$
DECLARE v_nome TEXT;
BEGIN
  SELECT conname INTO v_nome
  FROM pg_constraint
  WHERE conrelid = 'collegamenti_commercialista'::regclass
    AND contype = 'f'
    AND confrelid = 'commercialisti'::regclass;
  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE collegamenti_commercialista DROP CONSTRAINT %I', v_nome);
  END IF;
END
$$;
ALTER TABLE collegamenti_commercialista
  ADD CONSTRAINT collegamenti_commercialista_commercialista_id_fkey
  FOREIGN KEY (commercialista_id) REFERENCES commercialisti(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- elimina_account_commercialista: tutto in una transazione, sotto il lock della
-- riga dello studio. Restituisce quanti collegamenti ha revocato; NULL se lo
-- studio non c'e' o e' gia' eliminato.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION elimina_account_commercialista(p_commercialista_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_revocati INTEGER;
BEGIN
    PERFORM 1 FROM commercialisti
     WHERE id = p_commercialista_id AND eliminato_il IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Revoca dei collegamenti aperti: il trigger della 006 accoda l'avviso al
    -- cliente (revocato_da = 'commercialista': allo studio non va nulla).
    UPDATE collegamenti_commercialista
       SET stato = 'revocata', data_revoca = NOW(), revocato_da = 'commercialista',
           motivo_revoca = 'Account dello studio eliminato'
     WHERE commercialista_id = p_commercialista_id
       AND stato IN ('in_attesa','attiva','sospesa');
    GET DIAGNOSTICS v_revocati = ROW_COUNT;

    -- Niente piu' posta allo studio: non ha piu' un indirizzo.
    UPDATE notifiche n
       SET stato = 'annullata', in_lavorazione_fino = NULL
      FROM collegamenti_commercialista c
     WHERE c.id = n.collegamento_id
       AND c.commercialista_id = p_commercialista_id
       AND n.destinatario_tipo = 'commercialista'
       AND n.stato = 'in_coda';

    -- Link di reset e di conferma email ancora aperti.
    UPDATE token_account
       SET annullato_il = NOW()
     WHERE commercialista_id = p_commercialista_id
       AND usato_il IS NULL AND annullato_il IS NULL;

    -- Anonimizzazione. La ragione sociale resta: e' il nome con cui il cliente
    -- ritrova lo studio nella chat e nel registro degli accessi. Password
    -- inutilizzabile e versione delle credenziali avanti: ogni JWT emesso muore.
    UPDATE commercialisti
       SET username = NULL,
           email = NULL,
           telefono = NULL,
           partita_iva = NULL,
           ragione_sociale = COALESCE(NULLIF(btrim(ragione_sociale), ''), 'Studio eliminato'),
           password_hash = '!',
           versione_credenziali = versione_credenziali + 1,
           eliminato_il = NOW(),
           updated_at = NOW()
     WHERE id = p_commercialista_id;

    RETURN v_revocati;
END;
$$ LANGUAGE plpgsql;

COMMIT;
