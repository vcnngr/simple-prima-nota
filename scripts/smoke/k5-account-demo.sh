#!/usr/bin/env bash
# Smoke test della migrazione 011 (blocco K5): account demo bloccati.
#
# Crea da se' un database di prova (postgres:16.15-bookworm) e avvia il backend
# del checkout. Verifica:
#   A. installazione nuova (init + 001..011): `admin`/`admin123`, `demo`/`password`
#      (e la `password123` del NOTICE di init.sql) non entrano piu'; hash cambiati,
#      bcrypt valido; un account registrato normalmente entra;
#   B. rollback (annulla 011): le password pubblicate tornano, la tabella sparisce;
#   C. installazione esistente (a 010): token di `admin` emesso prima, link di reset
#      aperto, `demo` con una password sua. Dopo la 011: `admin` bloccato, token
#      di prima rifiutato, link annullato; `demo` entra ancora con la sua;
#      riapplicare non fa nulla di nuovo;
#   D. un hash rigenerato della password pubblicata ($2b$, sale diverso) e'
#      bloccato anche lui;
#   E. la pagina di login non mostra piu' credenziali demo; copia nel chart allineata.
#
#   ./scripts/smoke/k5-account-demo.sh      (servono docker e node)
#
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMG_PG=docker.io/library/postgres:16.15-bookworm
S=pn-k5d-$$
T="$(mktemp -d)"
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  OK    $1"; }
ko() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "         $2"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "atteso=$2 ottenuto=$3"; fi; }

pulisci() {
  [ -f "$T/pid" ] && kill "$(cat "$T/pid")" 2>/dev/null
  docker rm -f "$S-db" >/dev/null 2>&1
  rm -rf "$T"
}
trap pulisci EXIT

porta_libera() { node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})'; }
q()     { docker exec -i "$S-db" psql -X -U postgres -d prima_nota -tA -c "$1" 2>&1; }
migra() { docker run --rm --network "container:$S-db" -e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD=pw \
            -e PGDATABASE=prima_nota -v "$R/database:/database:ro" "$IMG_PG" bash /database/migra.sh "$@" > "$T/migra" 2>&1; }
bc()    { (cd "$R/backend" && node -e "$1" "${@:2}"); }
login() { curl -s -o "$T/body" -w '%{http_code}' --max-time 10 -X POST "$API/auth/login" \
            -H 'Content-Type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}"; }
# Credenziali sbagliate: il backend risponde 400 "Credenziali non valide".
rifiuto() { local c; c=$(login "$1" "$2"); grep -q 'Credenziali non valide' "$T/body" && echo "rifiutato" || echo "HTTP $c"; }
token() { python3 -c 'import sys,json;print(json.load(open(sys.argv[1])).get("token",""))' "$T/body" 2>/dev/null; }

PGP=$(porta_libera); AP=$(porta_libera); API="http://127.0.0.1:$AP/api"
docker run -d --name "$S-db" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=prima_nota -p "127.0.0.1:$PGP:5432" "$IMG_PG" >/dev/null
for _ in $(seq 1 40); do q 'select 1' >/dev/null 2>&1 && [ "$(q 'select 1')" = 1 ] && break; sleep 1; done
sleep 1

(cd "$R/backend" && exec env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT="$AP" DB_HOST=127.0.0.1 \
   DB_PORT="$PGP" DB_NAME=prima_nota DB_USER=postgres DB_PASSWORD=pw JWT_SECRET=k5-demo-solo-smoke-0123456789abcdef \
   RATE_LIMIT_MAX_REQUESTS=100000 node server.js) > "$T/be.log" 2>&1 < /dev/null &
echo $! > "$T/pid"

PUB_ADMIN='$2b$10$yxaU3JOqC8dpeH8fLFtRWOAzzNvqTNQNF44GcPIxWtct6B54HEEuK'
PUB_DEMO='$2b$10$7gusA60TTbNH2RMgwdGm0.3ZYMAtgLG2CTsLMuFF8nSuH4kCmtwrO'
hash_di() { q "SELECT password_hash FROM utenti WHERE username='$1'"; }

# ------------------------------------------------------------------------------
echo "=== A. installazione nuova ==="
migra; eq "migra.sh fino alla 011" "0" "$?"
eq "011 registrata" "1" "$(q "SELECT count(*) FROM schema_migrazioni WHERE versione='011'")"
for _ in $(seq 1 30); do curl -s --max-time 1 "$API/health" >/dev/null && break; sleep 0.5; done
eq "admin / admin123: rifiutato" "rifiutato" "$(rifiuto admin admin123)"
eq "admin / password123: rifiutato" "rifiutato" "$(rifiuto admin password123)"
eq "demo / password: rifiutato" "rifiutato" "$(rifiuto demo password)"
eq "hash di admin e demo cambiati" "0|0" "$([ "$(hash_di admin)" = "$PUB_ADMIN" ] && echo 1 || echo 0)|$([ "$(hash_di demo)" = "$PUB_DEMO" ] && echo 1 || echo 0)"
eq "nuovi hash bcrypt validi (bcryptjs li legge, password ignota)" "false false" \
  "$(bc 'const b=require("bcryptjs");const r=process.argv.slice(1).map(h=>{try{return b.compareSync("password",h)||b.compareSync("admin123",h)}catch(e){return "errore"}});console.log(r.join(" "))' "$(hash_di admin)" "$(hash_di demo)")"
eq "registro dei blocchi: 2 righe" "2" "$(q 'SELECT count(*) FROM account_demo_bloccati')"
eq "versione_credenziali +1" "1|1" "$(q "SELECT string_agg(versione_credenziali::text,'|' ORDER BY username) FROM utenti WHERE username IN ('admin','demo')")"
curl -s -o /dev/null -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d '{"username":"k5nuovo","email":"k5nuovo@t.it","password":"Password123!"}'
eq "un account registrato entra" "200" "$(login k5nuovo 'Password123!')"

# ------------------------------------------------------------------------------
echo
echo "=== B. rollback ==="
migra annulla 011; eq "annulla 011" "0" "$?"
eq "password pubblicate di nuovo al loro posto" "1|1" "$([ "$(hash_di admin)" = "$PUB_ADMIN" ] && echo 1 || echo 0)|$([ "$(hash_di demo)" = "$PUB_DEMO" ] && echo 1 || echo 0)"
eq "tabella rimossa" "" "$(q "SELECT to_regclass('account_demo_bloccati')")"
eq "demo / password entra (stato della 010)" "200" "$(login demo password)"

# ------------------------------------------------------------------------------
echo
echo "=== C. installazione esistente ==="
eq "admin / admin123 entra prima della 011" "200" "$(login admin admin123)"
TOK_ADMIN=$(token)
eq "token di admin valido prima" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/profile" -H "Authorization: Bearer $TOK_ADMIN")"
HD=$(bc 'console.log(require("bcryptjs").hashSync("MiaPassword-K5!",10))')
q "UPDATE utenti SET password_hash='$HD' WHERE username='demo'" >/dev/null
q "INSERT INTO token_account (user_id, scopo, token_hash, versione_credenziali, scadenza)
   SELECT id, 'reset_password', repeat('a',64), versione_credenziali, NOW() + INTERVAL '1 hour' FROM utenti WHERE username='admin'" >/dev/null
migra; eq "011 riapplicata" "0" "$?"
eq "admin / admin123: rifiutato" "rifiutato" "$(rifiuto admin admin123)"
eq "token di admin emesso prima: rifiutato" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/profile" -H "Authorization: Bearer $TOK_ADMIN")"
eq "link di reset di admin annullato" "1" "$(q "SELECT count(*) FROM token_account WHERE token_hash=repeat('a',64) AND annullato_il IS NOT NULL")"
eq "demo con una password sua: non toccato" "200" "$(login demo 'MiaPassword-K5!')"
eq "registro dei blocchi: solo admin" "admin" "$(q "SELECT string_agg(u.username, ',') FROM account_demo_bloccati b JOIN utenti u ON u.id=b.user_id")"
H1=$(hash_di admin); migra
eq "seconda esecuzione: nulla da fare, hash invariato" "0|1" "$?|$([ "$(hash_di admin)" = "$H1" ] && echo 1 || echo 0)"

# ------------------------------------------------------------------------------
echo
echo "=== D. hash rigenerato della password pubblicata ==="
migra annulla 011 >/dev/null
HR=$(bc 'console.log(require("bcryptjs").hashSync("password",10))')
case "$HR" in '$2b$'*|'$2a$'*) ;; *) ko "bcryptjs produce un hash bcrypt" "$HR";; esac
q "UPDATE utenti SET password_hash='$HR' WHERE username='demo'" >/dev/null
eq "demo / password entra (hash con sale nuovo)" "200" "$(login demo password)"
migra
eq "demo / password: rifiutato dopo la 011" "rifiutato" "$(rifiuto demo password)"

# ------------------------------------------------------------------------------
echo
echo "=== E. frontend e chart ==="
eq "login senza credenziali demo" "0" "$(grep -ciE 'credenziali demo|<strong>Password:</strong>' "$R/frontend/src/pages/Auth/LoginPage.js")"
eq "migrazione 011 copiata nel chart" "ok" "$(cmp -s "$R/database/migrations/011_account_demo_bloccati.sql" "$R/helm-chart/files/database/migrations/011_account_demo_bloccati.sql" && cmp -s "$R/database/migrations/011_account_demo_bloccati_down.sql" "$R/helm-chart/files/database/migrations/011_account_demo_bloccati_down.sql" && echo ok)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
