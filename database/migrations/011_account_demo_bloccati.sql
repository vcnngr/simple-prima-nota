-- ==============================================================================
-- 011 — Account demo bloccati (blocco K5)
-- ==============================================================================
-- init.sql crea `admin` e `demo` su ogni installazione nuova, produzione
-- compresa, con password pubblicate nel repo (`demo`/`password`; `admin` ha
-- `admin123`, anche se il NOTICE di init.sql dice `password123`). Chiunque
-- conosca il repo entra.
--
-- init.sql non si tocca (e' la versione 000, registrata con il suo SHA-256):
-- qui, sulle installazioni esistenti e su quelle nuove, un account `admin` o
-- `demo` che ha ancora una password pubblicata riceve una password casuale che
-- nessuno conosce. Chi l'ha cambiata con una sua non viene toccato.
--   * si confronta l'hash esatto di init.sql e, con crypt() di pgcrypto (009),
--     anche le tre password pubblicate su hash rigenerati; pgcrypto legge solo
--     il prefisso $2a$, che per bcrypt e' lo stesso algoritmo di $2b$/$2y$;
--   * `versione_credenziali` + 1: i token gia' emessi smettono di valere (008);
--   * i link di reset e di conferma email ancora aperti si annullano.
-- Il reset via mail non riapre questi account: le email sono @example.com.
-- Un amministratore che li vuole usare imposta una password da SQL.
--
-- `account_demo_bloccati` tiene quale hash c'era e quale e' stato messo, per il
-- rollback in 011_account_demo_bloccati_down.sql.
-- ==============================================================================

BEGIN;

CREATE TABLE account_demo_bloccati (
    user_id INTEGER PRIMARY KEY REFERENCES utenti(id) ON DELETE CASCADE,
    hash_precedente TEXT NOT NULL,
    hash_blocco TEXT NOT NULL,
    bloccato_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH candidati AS (
    SELECT id, password_hash,
           regexp_replace(password_hash, '^\$2[by]\$', '$2a$') AS h2a
    FROM utenti
    WHERE username IN ('admin', 'demo')
    FOR UPDATE
), bersagli AS (
    SELECT id, password_hash
    FROM candidati c
    WHERE c.password_hash IN (
            '$2b$10$yxaU3JOqC8dpeH8fLFtRWOAzzNvqTNQNF44GcPIxWtct6B54HEEuK',
            '$2b$10$7gusA60TTbNH2RMgwdGm0.3ZYMAtgLG2CTsLMuFF8nSuH4kCmtwrO')
       OR (c.h2a ~ '^\$2a\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
           AND EXISTS (SELECT 1 FROM unnest(ARRAY['password', 'admin123', 'password123']) AS p(pw)
                       WHERE crypt(p.pw, c.h2a) = c.h2a))
), nuovi AS (
    SELECT id, password_hash AS precedente,
           crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 10)) AS blocco
    FROM bersagli
), registrati AS (
    INSERT INTO account_demo_bloccati (user_id, hash_precedente, hash_blocco)
    SELECT id, precedente, blocco FROM nuovi
    RETURNING user_id
)
UPDATE utenti u
SET password_hash = n.blocco,
    versione_credenziali = u.versione_credenziali + 1
FROM nuovi n
WHERE u.id = n.id;

UPDATE token_account t
SET annullato_il = NOW()
FROM account_demo_bloccati b
WHERE t.user_id = b.user_id AND t.usato_il IS NULL AND t.annullato_il IS NULL;

COMMIT;
