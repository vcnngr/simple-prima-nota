#!/usr/bin/env bash
# Smoke test del blocco U6b, parte 1 (fase UX): pagine dell'account nel nuovo frontend.
#
#   A. API: profilo dello studio con partita IVA e telefono; il token dell'utente
#      non apre il profilo dello studio;
#   B. build e browser (Chrome headless, nginx con la CSP vera): registrazione di
#      utente e studio, password dimenticata e link della mail, conferma del
#      nuovo indirizzo, cambio della password, codice d'invito per lo studio,
#      dati dello studio, eliminazione dell'account; 390 px, zero violazioni CSP;
#   C. database dopo il browser.
#
#   API=http://127.0.0.1:33360/api DB_CONTAINER=pn-u6-db MAIL_API=http://127.0.0.1:58060 ./scripts/smoke/u6b-account.sh
#
# Il backend deve avere ACCOUNT_MAIL_ATTESA_SEC basso (3) e la posta su mailpit.
# Fotografie in FOTO (predefinito: temporanea). Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
MAIL_API="${MAIL_API:-http://localhost:8025}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; NGX="u6bweb-$SFX"
trap 'docker rm -f "$NGX" >/dev/null 2>&1; rm -rf "${T:?}"' EXIT
FOTO="${FOTO:-$T/foto}"; mkdir -p "$FOTO"
D="$R/web"

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
hit() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" "$@"; }
py() { python3 -c "import sys,json;d=json.load(open('$T/body'));$1" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}

echo "=== A. API (suffisso $SFX) ==="
eq "mailpit risponde" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$MAIL_API/api/v1/messages")"
CA="u6bs$SFX"; UA="u6bx$SFX"
CT=$(curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$CA\",\"email\":\"$CA@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio $CA\"}" | tok)
UT=$(curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$UA\",\"email\":\"$UA@t.it\",\"password\":\"$PW\"}" | tok)
curl -s -X PUT "$API/commercialisti/profile" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"partita_iva":"01234567890","telefono":"06 555"}' >/dev/null
eq "profilo dello studio: partita IVA e telefono" "01234567890|06 555|Studio $CA" \
  "$(hit -H "Authorization: Bearer $CT" "$API/commercialisti/profile" >/dev/null; py "c=d['commercialista'];print(c['partita_iva'],c['telefono'],c['ragione_sociale'],sep='|')")"
eq "nessuna versione delle credenziali nel profilo" "False" "$(py "print('versione_credenziali' in d['commercialista'])")"
eq "token dell'utente sul profilo dello studio: 401" "401" "$(hit -H "Authorization: Bearer $UT" "$API/commercialisti/profile")"

echo
echo "=== B. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
U="u6bu$SFX"; S="u6bt$SFX"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" MAIL_API="$MAIL_API" UTENTE="$U" STUDIO="$S" SFX="$SFX" PW="$PW" \
  browser node "$R/scripts/smoke/lib/u6b-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== C. database dopo il browser ==="
eq "utente registrato dalla pagina, poi eliminato" "0" "$(q "SELECT count(*) FROM utenti WHERE username='$U'")"
eq "suoi inviti spariti con lui" "0" "$(q "SELECT count(*) FROM token_inviti t LEFT JOIN utenti u ON u.id=t.user_id WHERE u.id IS NULL")"
eq "studio registrato dalla pagina, poi eliminato: anonimizzato, il nome resta" "1|||true|!" \
  "$(q "SELECT count(*) FROM commercialisti WHERE ragione_sociale='Studio Bianchi $SFX'")|$(q "SELECT coalesce(username,'')||'|'||coalesce(partita_iva,'')||'|'||(eliminato_il IS NOT NULL)||'|'||password_hash FROM commercialisti WHERE ragione_sociale='Studio Bianchi $SFX'")"
eq "account di prova dell'API intatti" "1|1" "$(q "SELECT count(*) FROM utenti WHERE username='$UA'")|$(q "SELECT count(*) FROM commercialisti WHERE username='$CA' AND eliminato_il IS NULL")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
