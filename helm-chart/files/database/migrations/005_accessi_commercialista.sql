-- ==============================================================================
-- 005 — Registro degli accessi del commercialista ai dati del cliente (blocco W3)
-- ==============================================================================
-- Fino alla 004 il commercialista poteva leggere conti, IBAN e movimenti ed
-- esportare l'intera contabilita' senza lasciare traccia. Dopo una revoca non
-- c'era modo di dire al cliente cosa fosse stato visto o esportato.
--
-- Questa migration introduce `accessi_commercialista`: una riga per ogni accesso
-- concesso (lista clienti, dettaglio, export, chat, disconnessione), scritta dal
-- backend PRIMA di servire i dati. Se la scrittura fallisce, i dati non escono.
--
-- Tre invarianti tenute dal database, non dall'applicazione:
--   1. la riga e' coerente con il collegamento: FK composta su
--      (collegamento_id, commercialista_id, user_id), cosi' non si puo' imputare
--      un accesso al cliente sbagliato;
--   2. la riga non si riscrive: l'unico UPDATE ammesso e' valorizzare una volta
--      `numero_record` (noto solo a export generato);
--   3. la riga non si cancella a mano: sparisce solo in cascata, quando sparisce
--      il collegamento (eliminazione dell'account).
--
-- Rollback in 005_accessi_commercialista_down.sql.
-- ==============================================================================

BEGIN;

-- Bersaglio della FK composta. `id` e' gia' unico: l'indice non restringe nulla,
-- serve solo a poter referenziare la terna.
CREATE UNIQUE INDEX IF NOT EXISTS idx_collegamenti_id_coppia
  ON collegamenti_commercialista (id, commercialista_id, user_id);

CREATE TABLE IF NOT EXISTS accessi_commercialista (
    id                BIGSERIAL PRIMARY KEY,
    collegamento_id   INTEGER NOT NULL,
    commercialista_id INTEGER NOT NULL,
    user_id           INTEGER NOT NULL,
    tipo_accesso      VARCHAR(30) NOT NULL
        CHECK (tipo_accesso IN ('lista_clienti','dettaglio_cliente','export','chat','disconnessione')),
    -- Parametri dell'accesso (pagina, formato, filtri) e fotografia dell'ambito in
    -- vigore in quel momento: l'ambito puo' cambiare, l'accesso resta quello che fu.
    dettagli          JSONB NOT NULL DEFAULT '{}'::jsonb,
    numero_record     INTEGER CHECK (numero_record IS NULL OR numero_record >= 0),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_accessi_collegamento
        FOREIGN KEY (collegamento_id, commercialista_id, user_id)
        REFERENCES collegamenti_commercialista (id, commercialista_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accessi_user_data
  ON accessi_commercialista (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accessi_collegamento_data
  ON accessi_commercialista (collegamento_id, created_at DESC);
-- Per la deduplica oraria di lista_clienti/chat (vedi registra_accessi_elenco).
CREATE INDEX IF NOT EXISTS idx_accessi_collegamento_tipo_data
  ON accessi_commercialista (collegamento_id, tipo_accesso, created_at DESC);

-- ------------------------------------------------------------------------------
-- Immutabilita'
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accessi_commercialista_immutabile()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Profondita' 1 = DELETE diretto sulla tabella. In cascata dalla FK il
        -- trigger gira dentro il trigger referenziale, quindi a profondita' >= 2.
        IF pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'accessi_commercialista e'' un registro: le righe non si cancellano'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: solo numero_record, solo da NULL, solo una volta.
    IF OLD.numero_record IS NULL
       AND NEW.numero_record IS NOT NULL
       AND NEW.id                IS NOT DISTINCT FROM OLD.id
       AND NEW.collegamento_id   IS NOT DISTINCT FROM OLD.collegamento_id
       AND NEW.commercialista_id IS NOT DISTINCT FROM OLD.commercialista_id
       AND NEW.user_id           IS NOT DISTINCT FROM OLD.user_id
       AND NEW.tipo_accesso      IS NOT DISTINCT FROM OLD.tipo_accesso
       AND NEW.dettagli          IS NOT DISTINCT FROM OLD.dettagli
       AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'accessi_commercialista e'' un registro: le righe non si modificano'
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accessi_immutabile ON accessi_commercialista;
CREATE TRIGGER trigger_accessi_immutabile
  BEFORE UPDATE OR DELETE ON accessi_commercialista
  FOR EACH ROW EXECUTE FUNCTION accessi_commercialista_immutabile();

-- ------------------------------------------------------------------------------
-- Accessi "di elenco": dashboard e anteprima chat mostrano dati di TUTTI i clienti
-- attivi a ogni caricamento. Una riga per cliente per caricamento renderebbe il
-- registro illeggibile; una riga per cliente per ora dice lo stesso al cliente
-- ("il tuo commercialista ha aperto l'elenco oggi alle 10") senza rumore.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registra_accessi_elenco(
    p_commercialista_id INTEGER,
    p_tipo VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    v_n INTEGER;
BEGIN
    INSERT INTO accessi_commercialista
        (collegamento_id, commercialista_id, user_id, tipo_accesso, dettagli)
    SELECT c.id, c.commercialista_id, c.user_id, p_tipo,
           jsonb_build_object('ambito', jsonb_build_object(
               'dal', c.ambito_dal, 'al', c.ambito_al, 'conti', c.conti_ammessi))
    FROM collegamenti_commercialista c
    WHERE c.commercialista_id = p_commercialista_id
      AND c.stato = 'attiva'
      AND NOT EXISTS (
          SELECT 1 FROM accessi_commercialista a
          WHERE a.collegamento_id = c.id
            AND a.tipo_accesso = p_tipo
            AND a.created_at > NOW() - INTERVAL '1 hour'
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql;

COMMIT;
