-- Rollback della 006: toglie trigger, funzioni e coda delle notifiche.
-- Le notifiche ancora in coda vanno perse: sono avvisi, non dati contabili.

BEGIN;

DROP TRIGGER IF EXISTS trigger_notifica_collegamento ON collegamenti_commercialista;
DROP FUNCTION IF EXISTS notifica_transizione_collegamento();
DROP FUNCTION IF EXISTS accoda_promemoria_non_letti(INTEGER);
DROP TABLE IF EXISTS notifiche;

COMMIT;
