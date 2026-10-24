#!/usr/bin/env bash
# Smoke test del blocco U3 (fase UX): base del nuovo frontend in web/.
#
#   A. progetto: Vite, TanStack Query v5, React Router 7, niente react-scripts;
#      lockfile; npm audit delle dipendenze di produzione pulito;
#   B. build: esce 0; niente mappe dei sorgenti; niente script in linea in
#      index.html (CSP script-src 'self'); caratteri serviti dal sito, nessun
#      font di Google; file in /static/ (cache immutabile di nginx);
#   C. token: i quattro temi (Registro/Bottega x chiaro/scuro) nel CSS;
#      chiamate al server solo da src/api/client.js;
#   D. nel browser (Chrome headless, build servita da nginx con la CSP vera):
#      login di utente e studio, token separati, tema dall'account, cambio di
#      tema salvato con PUT, "automatico" che segue il sistema, sessione
#      scaduta, pagine dell'altro tipo rifiutate, 390 px senza scroll
#      orizzontale, desktop, zero violazioni CSP. Fotografie in $FOTO.
#
#   API=http://127.0.0.1:3300/api ./scripts/smoke/u3-web.sh
#
# La build di web/ di questo checkout la serve un nginx in docker con
# web/nginx/default.conf.template (stessa CSP della produzione), che
# inoltra /api al backend di API (BACKEND_UPSTREAM, predefinito
# host.docker.internal:<porta di API>). Fotografie in FOTO (predefinito: temporanea).
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; NGX="u3web-$SFX"
trap 'docker rm -f "$NGX" >/dev/null 2>&1; rm -rf "${T:?}"' EXIT
FOTO="${FOTO:-$T/foto}"; mkdir -p "$FOTO"
D="$R/web"

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")

echo "=== A. progetto ==="
pj() { python3 -c "import json;d=json.load(open('$D/package.json'));print($1)" 2>/dev/null || echo "-"; }
eq "web/package.json presente" "1" "$([ -f "$D/package.json" ] && echo 1 || echo 0)"
eq "Vite, TanStack Query 5, React Router 7" "vite|^5|^7" \
  "$(pj "'vite' if 'vite' in d['devDependencies'] else '-'")|$(pj "d['dependencies']['@tanstack/react-query'][:2]")|$(pj "d['dependencies']['react-router'][:2]")"
eq "niente react-scripts, react-query 3, axios" "0" "$(grep -cE '"(react-scripts|react-query|axios)"' "$D/package.json" 2>/dev/null)"
eq "lockfile versionato" "1" "$([ -f "$D/package-lock.json" ] && echo 1 || echo 0)"
(cd "$D" && npm audit --omit=dev --json 2>/dev/null) > "$T/audit.json"
eq "npm audit (produzione): 0 vulnerabilita'" "0" "$(j "['metadata']['vulnerabilities']['total']" < "$T/audit.json")"

echo
echo "=== B. build ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "nessuna mappa dei sorgenti" "0" "$(find "$D/dist" -name '*.map' 2>/dev/null | wc -l | tr -d ' ')"
eq "index.html: ogni script ha src (nessuno in linea)" "0" \
  "$(python3 -c "import re;h=open('$D/dist/index.html').read();print(len([s for s in re.findall(r'<script[^>]*>', h) if 'src=' not in s]))" 2>/dev/null || echo -)"
eq "tema prima del primo disegno da un file del sito" "1" "$(grep -c 'src="/tema-iniziale.js"' "$D/dist/index.html" 2>/dev/null || echo 0)"
eq "nessun font di Google nella build" "0" "$(grep -rlE 'fonts\.(googleapis|gstatic)\.com' "$D/dist" 2>/dev/null | wc -l | tr -d ' ')"
eq "caratteri dei due temi serviti dal sito" "4" \
  "$(for f in atkinson-hyperlegible source-serif-4 fraunces instrument-sans; do ls "$D/dist/static/" 2>/dev/null | grep -q "^$f-latin-400.*woff2$" && echo x; done | wc -l | tr -d ' ')"
eq "file con hash in /static/" "1" "$(ls "$D/dist/static/" 2>/dev/null | grep -cE '^index-[A-Za-z0-9_-]+\.js$')"

echo
echo "=== C. token e chiamate ==="
for c in '#1f45a0' '#86a6ff' '#2f4b3c' '#84b898' '#f2b825' '#f5c542' '#d9622b' '#ee7a43'; do
  eq "colore ratificato $c nei token" "1" "$([ "$(grep -ci "$c" "$D/src/tema/token.css" 2>/dev/null)" -gt 0 ] && echo 1 || echo 0)"
done
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" 2>/dev/null && grep -rl 'fetch(' src | sort | paste -sd, -)"

echo
echo "=== D. browser ==="
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 30); do curl -s --max-time 1 -o /dev/null "$WEB/api/health" && break; sleep 0.5; done
eq "nginx con la CSP del progetto davanti alla build" "200|1" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")|$(curl -sI "$WEB/" | grep -c "script-src 'self';")"
U="u3u$SFX"; C="u3c$SFX"
curl -s -o /dev/null -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$U\",\"email\":\"$U@t.it\",\"password\":\"$PW\"}"
CT=$(curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" \
  -d "{\"username\":\"$C\",\"email\":\"$C@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio Rossi e Associati\"}" | j "['token']")
UT=$(curl -s -X POST "$API/auth/login" "${JSON[@]}" -d "{\"username\":\"$U\",\"password\":\"$PW\"}" | j "['token']")
eq "account di prova creati" "1|1" "$([ ${#UT} -gt 20 ] && echo 1)|$([ ${#CT} -gt 20 ] && echo 1)"
# Il browser deve trovare queste preferenze sull'account, non quelle locali.
curl -s -o /dev/null -X PUT "$API/auth/preferenze" "${JSON[@]}" -H "Authorization: Bearer $UT" -d '{"tema":"bottega","aspetto":"scuro"}'
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" UTENTE="$U" STUDIO="$C" PW="$PW" \
  node "$R/scripts/smoke/lib/u3-browser.mjs" > "$T/browser.log" 2>&1
grep -v '^CONTEGGIO' "$T/browser.log"
read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/browser.log")"
[ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  il browser non ha concluso"; tail -5 "$T/browser.log"; }
PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
echo "  fotografie: $FOTO"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
