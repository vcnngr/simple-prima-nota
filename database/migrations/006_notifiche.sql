-- ==============================================================================
-- 006 — Notifiche fuori dall'app: outbox (blocco W4)
-- ==============================================================================
-- Fino alla 005 l'unico modo di sapere che un commercialista aveva chiesto il
-- collegamento, o che il cliente l'aveva accettato o revocato, era avere l'app
-- aperta: sidebar e chat interrogano il server ogni 10-30 secondi.
--
-- Questa migration introduce `notifiche`, una coda in uscita (outbox). Le righe
-- NON le scrive il backend route per route: le scrivono i trigger sulle
-- transizioni di `collegamenti_commercialista`, nella stessa transazione della
-- transizione. Cosi' non esiste una transizione senza la sua notifica, e nessuna
-- route futura puo' dimenticarsela. L'invio (SMTP) lo fa un worker del backend
-- che legge la coda: se l'invio fallisce la riga resta e si ritenta.
--
-- Il testo della mail NON sta in tabella: si compone all'invio, con i dati
-- correnti. In tabella ci sono evento, destinatario (lato del collegamento) e
-- stato di consegna. Nessun dato contabile, nessun testo di chat.
--
-- Promemoria "messaggi non letti": `accoda_promemoria_non_letti(ore)`, chiamata
-- periodicamente dal worker.
--
-- Rollback in 006_notifiche_down.sql.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notifiche (
    id                   BIGSERIAL PRIMARY KEY,
    -- Ogni evento nasce da un collegamento: il destinatario e' uno dei due lati,
    -- e l'indirizzo si risolve all'invio (se nel frattempo cambia, vale il nuovo).
    collegamento_id      INTEGER NOT NULL
        REFERENCES collegamenti_commercialista(id) ON DELETE CASCADE,
    destinatario_tipo    VARCHAR(20) NOT NULL
        CHECK (destinatario_tipo IN ('user','commercialista')),
    evento               VARCHAR(40) NOT NULL
        CHECK (evento IN ('richiesta_ricevuta','richiesta_accettata','richiesta_rifiutata',
                          'collegamento_sospeso','collegamento_riattivato',
                          'collegamento_revocato','messaggi_non_letti')),
    stato                VARCHAR(20) NOT NULL DEFAULT 'in_coda'
        CHECK (stato IN ('in_coda','inviata','fallita','annullata')),
    tentativi            INTEGER NOT NULL DEFAULT 0,
    prossimo_tentativo   TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Lease del worker: finche' non scade, un altro worker non la prende.
    in_lavorazione_fino  TIMESTAMP,
    -- Solo il codice d'errore (ECONNREFUSED, EAUTH...), mai il messaggio del server
    -- SMTP, che di solito cita l'indirizzo del destinatario.
    ultimo_errore        VARCHAR(60),
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    inviata_at           TIMESTAMP
);

-- Il worker cerca le righe da spedire.
CREATE INDEX IF NOT EXISTS idx_notifiche_da_inviare
  ON notifiche (prossimo_tentativo, id) WHERE stato = 'in_coda';
-- Deduplica di richieste e promemoria.
CREATE INDEX IF NOT EXISTS idx_notifiche_collegamento_evento
  ON notifiche (collegamento_id, evento, destinatario_tipo, created_at DESC);

-- ------------------------------------------------------------------------------
-- Trigger: una transizione, una notifica, nella stessa transazione
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notifica_transizione_collegamento()
RETURNS TRIGGER AS $$
DECLARE
    v_dest VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.stato <> 'in_attesa' THEN
            RETURN NEW;
        END IF;
        -- La richiesta va al lato che non l'ha fatta.
        v_dest := CASE WHEN NEW.richiesto_da = 'user' THEN 'commercialista' ELSE 'user' END;

        -- Un commercialista rifiutato puo' ribussare subito (la richiesta resta
        -- visibile in app), ma la mail parte al massimo una volta ogni 7 giorni per
        -- coppia: senza questo, rifiuto e nuova richiesta diventano un modo per
        -- mandare posta a ripetizione a un cliente.
        IF EXISTS (
            SELECT 1
            FROM notifiche n
            JOIN collegamenti_commercialista c ON c.id = n.collegamento_id
            WHERE c.commercialista_id = NEW.commercialista_id
              AND c.user_id = NEW.user_id
              AND n.evento = 'richiesta_ricevuta'
              AND n.created_at > NOW() - INTERVAL '7 days'
        ) THEN
            RETURN NEW;
        END IF;

        INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
        VALUES (NEW.id, v_dest, 'richiesta_ricevuta');
        RETURN NEW;
    END IF;

    -- UPDATE: solo i cambi di stato.
    IF NEW.stato IS NOT DISTINCT FROM OLD.stato THEN
        RETURN NEW;
    END IF;

    IF OLD.stato = 'in_attesa' AND NEW.stato = 'attiva' THEN
        INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
        VALUES (NEW.id, 'commercialista', 'richiesta_accettata');
    ELSIF OLD.stato = 'in_attesa' AND NEW.stato = 'rifiutata' THEN
        INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
        VALUES (NEW.id, 'commercialista', 'richiesta_rifiutata');
    ELSIF OLD.stato = 'attiva' AND NEW.stato = 'sospesa' THEN
        INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
        VALUES (NEW.id, 'commercialista', 'collegamento_sospeso');
    ELSIF OLD.stato = 'sospesa' AND NEW.stato = 'attiva' THEN
        INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
        VALUES (NEW.id, 'commercialista', 'collegamento_riattivato');
    ELSIF NEW.stato = 'revocata' THEN
        -- Avvisato il lato che NON ha revocato. Senza autore noto, entrambi.
        IF NEW.revocato_da IS DISTINCT FROM 'user' THEN
            INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
            VALUES (NEW.id, 'user', 'collegamento_revocato');
        END IF;
        IF NEW.revocato_da IS DISTINCT FROM 'commercialista' THEN
            INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
            VALUES (NEW.id, 'commercialista', 'collegamento_revocato');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notifica_collegamento ON collegamenti_commercialista;
CREATE TRIGGER trigger_notifica_collegamento
    AFTER INSERT OR UPDATE OF stato ON collegamenti_commercialista
    FOR EACH ROW EXECUTE FUNCTION notifica_transizione_collegamento();

-- ------------------------------------------------------------------------------
-- Promemoria messaggi non letti
-- ------------------------------------------------------------------------------
-- Per ogni collegamento attivo e per ciascun lato: se ci sono messaggi della
-- controparte non letti da piu' di p_ore, e almeno uno e' arrivato DOPO l'ultimo
-- promemoria, se ne accoda uno. Mai piu' di uno ogni 24 ore per lato.
-- Cosi' gli stessi messaggi non producono un promemoria a ogni giro del worker.
-- Restituisce quante righe ha accodato.
CREATE OR REPLACE FUNCTION accoda_promemoria_non_letti(p_ore INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_n INTEGER;
BEGIN
    -- Due backend che girano insieme non devono accodare due volte lo stesso
    -- promemoria: la funzione si serializza su se stessa.
    PERFORM pg_advisory_xact_lock(hashtext('accoda_promemoria_non_letti'));

    WITH lati AS (
        SELECT c.id AS collegamento_id, l.dest, l.mittente
        FROM collegamenti_commercialista c
        CROSS JOIN (VALUES ('user','commercialista'), ('commercialista','user')) AS l(dest, mittente)
        WHERE c.stato = 'attiva'
    ),
    candidati AS (
        SELECT la.collegamento_id, la.dest,
               (SELECT max(n.created_at) FROM notifiche n
                 WHERE n.collegamento_id = la.collegamento_id
                   AND n.destinatario_tipo = la.dest
                   AND n.evento = 'messaggi_non_letti') AS ultimo_promemoria
        FROM lati la
        WHERE EXISTS (
            SELECT 1 FROM messaggi_commercialista m
            WHERE m.collegamento_id = la.collegamento_id
              AND m.mittente_tipo = la.mittente
              AND m.letto = FALSE
              AND m.created_at < NOW() - make_interval(hours => p_ore)
        )
    )
    INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento)
    SELECT ca.collegamento_id, ca.dest, 'messaggi_non_letti'
    FROM candidati ca
    WHERE (ca.ultimo_promemoria IS NULL OR ca.ultimo_promemoria < NOW() - INTERVAL '24 hours')
      AND EXISTS (
          SELECT 1 FROM messaggi_commercialista m
          WHERE m.collegamento_id = ca.collegamento_id
            AND m.mittente_tipo = CASE WHEN ca.dest = 'user' THEN 'commercialista' ELSE 'user' END
            AND m.letto = FALSE
            AND m.created_at < NOW() - make_interval(hours => p_ore)
            AND m.created_at > COALESCE(ca.ultimo_promemoria, '-infinity'::timestamp)
      );

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$ LANGUAGE plpgsql;

COMMIT;
