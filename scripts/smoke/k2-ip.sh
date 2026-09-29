#!/usr/bin/env bash
# Smoke test del blocco K2: indirizzo del client e tetti di richieste.
#
# Verifica, avviando da se' il backend del checkout (senza database: basta
# /api/health, che passa dal tetto generale) con configurazioni diverse:
#   A. la regola di fiducia (backend/config/proxy.js) sui casi limite;
#   B. RATE_LIMIT_MAX_REQUESTS e' letto davvero (prima: 300/10000 fissi);
#   C. dietro un proxy (TRUST_PROXY=1) i client hanno tetti separati;
#   D. catena del chart, ingress + nginx (TRUST_PROXY=2): il tetto e' per client,
#      non per ingress; la X-Forwarded-For inventata dal client non conta;
#   E. backend esposto direttamente (TRUST_PROXY=0): X-Forwarded-For ignorata;
#   F. nginx del frontend davanti al backend (compose): la X-Forwarded-For
#      inventata non sposta il tetto e non finisce nel log di accesso;
#   G. nginx inoltra X-Forwarded-Proto dell'ingress, altrimenti il proprio schema;
#   H. chart e compose: TRUST_PROXY 2/1/impostato, RATE_LIMIT_MAX_REQUESTS 300,
#      porta 3001 di compose solo su 127.0.0.1.
#
#   ./scripts/smoke/k2-ip.sh
#
# Richiede node, docker (nginx:1.30-alpine) e helm. Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMG_NGINX=docker.io/library/nginx:1.30-alpine
S=pn-k2-$$
T="$(mktemp -d)"
LOG="$R/backend/logs/access.log"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  OK    $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "         $2"; }
eq()   { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "atteso=$2 ottenuto=$3"; fi; }

pulisci() {
  [ -f "$T/pids" ] && kill $(cat "$T/pids") 2>/dev/null
  docker rm -f $(docker ps -aq --filter "name=^$S-") >/dev/null 2>&1
  rm -rf "$T"
}
trap pulisci EXIT

porta_libera() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'; }

# backend <var=val...>: avvia il backend del checkout su una porta libera, la stampa.
backend() {
  local p; p=$(porta_libera)
  # Dentro $(...): stdout chiuso, altrimenti la sostituzione aspetta il backend.
  (cd "$R/backend" && exec env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT="$p" \
     DB_HOST=127.0.0.1 DB_PORT=1 JWT_SECRET=k2 "$@" node server.js) > "$T/be-$p.log" 2>&1 < /dev/null &
  echo $! >> "$T/pids"
  for _ in $(seq 1 40); do curl -s --max-time 1 -o /dev/null "http://127.0.0.1:$p/api/health" -H 'X-Forwarded-For: 192.0.2.250' && break; sleep 0.25; done
  echo "$p"
}
# codici <porta> <n> [xff con %d al posto del numero della richiesta]: codici HTTP separati da spazi
codici() {
  local out="" i
  for i in $(seq 1 "$2"); do
    if [ -n "${3:-}" ]; then
      out="$out $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "X-Forwarded-For: $(printf "$3" "$i")" "http://127.0.0.1:$1/api/health")"
    else
      out="$out $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$1/api/health")"
    fi
  done
  echo "${out# }"
}

# ------------------------------------------------------------------------------
echo "=== A. regola di fiducia ==="
A=$(cd "$R/backend" && node -e '
let p; try { p = require("./config/proxy"); } catch (e) { console.log("assente"); process.exit(0); }
const f = p.trustProxy("2"), z = p.trustProxy("0"), l = p.trustProxy("10.0.0.0/8");
const r = [f("127.0.0.1",0), f("10.1.2.3",1), f("10.1.2.3",2), f("203.0.113.5",0),
  f("::ffff:192.168.65.1",0), z, l("10.9.9.9",0), l("172.16.0.1",0)];
let e = "ok"; try { p.trustProxy("non-un-ip"); e = "accettato"; } catch (_) {}
console.log(r.join(",") + "|" + e);' 2>&1)
eq "hop privati si', oltre N no, pubblico no, 0 = nessuno, elenco rispettato; elenco non valido fermo" \
  "true,true,false,false,true,false,true,false|ok" "$A"

# ------------------------------------------------------------------------------
echo
echo "=== B. RATE_LIMIT_MAX_REQUESTS ==="
P=$(backend TRUST_PROXY=1 RATE_LIMIT_MAX_REQUESTS=5)
eq "5 richieste passano, la sesta 429" "200 200 200 200 200 429" "$(codici "$P" 6 '198.51.100.1')"
eq "intestazione RateLimit-Limit: 5" "5" "$(curl -s -D - -o /dev/null -H 'X-Forwarded-For: 198.51.100.9' "http://127.0.0.1:$P/api/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="ratelimit-limit"{print $2}')"

echo
echo "=== C. un proxy davanti (TRUST_PROXY=1) ==="
eq "un altro client ha il suo tetto" "200" "$(codici "$P" 1 '198.51.100.2')"
eq "e lo esaurisce da solo" "200 200 200 200 429" "$(codici "$P" 5 '198.51.100.2')"

# ------------------------------------------------------------------------------
echo
echo "=== D. ingress + nginx (TRUST_PROXY=2) ==="
# X-Forwarded-For come arriva al backend: <inventata dal client>, <client visto
# dall'ingress>, <ingress visto da nginx>; la connessione e' di nginx (loopback).
P=$(backend TRUST_PROXY=2 RATE_LIMIT_MAX_REQUESTS=5)
eq "client A: X-Forwarded-For inventata diversa ogni volta, tetto lo stesso" \
  "200 200 200 200 200 429" "$(codici "$P" 6 '203.0.113.%d, 198.51.100.10, 10.42.0.7')"
sleep 0.5
# req.ip come lo scrive il log di accesso (primo campo): il client, non l'ingress.
eq "log: l'indirizzo e' quello del client A, non dell'ingress" "198.51.100.10" \
  "$(grep ' 10.42.0.7\| 198.51.100.10\|^198.51.100.10 \|^10.42.0.7 \|^203.0.113' "$LOG" 2>/dev/null | tail -1 | awk '{print $1}')"
eq "client B dietro lo stesso ingress: non bloccato da A" \
  "200" "$(codici "$P" 1 '198.51.100.11, 10.42.0.7')"
eq "client B con indirizzo inventato: e' sempre B" \
  "200 200 200 200 429" "$(codici "$P" 5 '8.8.8.%d, 198.51.100.11, 10.42.0.7')"

# ------------------------------------------------------------------------------
echo
echo "=== E. backend esposto direttamente (TRUST_PROXY=0) ==="
P=$(backend TRUST_PROXY=0 RATE_LIMIT_MAX_REQUESTS=5)
# Il primo giro di attesa in backend() ha gia' consumato una richiesta.
eq "X-Forwarded-For diversa ogni volta: stesso tetto" "200 200 200 200 429" "$(codici "$P" 5 '203.0.113.%d')"

# ------------------------------------------------------------------------------
echo
echo "=== F. nginx del frontend davanti al backend (compose) ==="
P=$(backend TRUST_PROXY=1 RATE_LIMIT_MAX_REQUESTS=5)
docker run -d --name "$S-nginx" -p 127.0.0.1::80 --add-host host.docker.internal:host-gateway \
  -e BACKEND_UPSTREAM="host.docker.internal:$P" -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$R/frontend/nginx:/etc/nginx/templates:ro" "$IMG_NGINX" >/dev/null
N=$(docker port "$S-nginx" 80/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 30); do curl -s --max-time 1 "http://127.0.0.1:$N/health" | grep -q healthy && break; sleep 0.5; done
MARK="203.0.113.$((RANDOM % 200 + 20))"
eq "attraverso nginx, X-Forwarded-For inventata: stesso tetto" "200 200 200 200 200 429" \
  "$(for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' --max-time 5 -H "X-Forwarded-For: $MARK, 7.7.7.$i" "http://127.0.0.1:$N/api/health"; done | sed 's/ $//')"
sleep 0.5
eq "log di accesso: nessun indirizzo inventato" "0" "$(grep -c "$MARK" "$LOG" 2>/dev/null)"
eq "log di accesso: le richieste ci sono" "1" "$([ "$(grep -c 'GET /api/health' "$LOG" 2>/dev/null || echo 0)" -gt 0 ] && echo 1 || echo 0)"

# ------------------------------------------------------------------------------
echo
echo "=== G. X-Forwarded-Proto ==="
cat > "$T/eco.js" <<'EOF'
require('http').createServer((q, r) => r.end(String(q.headers['x-forwarded-proto']))).listen(+process.argv[2]);
EOF
PE=$(porta_libera); node "$T/eco.js" "$PE" > /dev/null 2>&1 < /dev/null & echo $! >> "$T/pids"
docker run -d --name "$S-proto" -p 127.0.0.1::80 --add-host host.docker.internal:host-gateway \
  -e BACKEND_UPSTREAM="host.docker.internal:$PE" -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$R/frontend/nginx:/etc/nginx/templates:ro" "$IMG_NGINX" >/dev/null
N=$(docker port "$S-proto" 80/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 30); do curl -s --max-time 1 "http://127.0.0.1:$N/health" | grep -q healthy && break; sleep 0.5; done
pr() { curl -s --max-time 5 "$@" "http://127.0.0.1:$N/api/x"; }
eq "dall'ingress con TLS: https" "https" "$(pr -H 'X-Forwarded-Proto: https')"
eq "senza intestazione: lo schema di nginx" "http" "$(pr)"
eq "valore strano: lo schema di nginx" "http" "$(pr -H 'X-Forwarded-Proto: javascript')"

# ------------------------------------------------------------------------------
echo
echo "=== H. chart e compose ==="
env_be() { helm template t "$R/helm-chart" "${@:2}" --show-only templates/backend-deployment.yaml 2>/dev/null \
  | awk -v k="$1" '$0 ~ "- name: "k"$" {getline; sub(/.*value: /,""); gsub(/"/,""); print}'; }
eq "con ingress: TRUST_PROXY 2" "2" "$(env_be TRUST_PROXY)"
eq "senza ingress: TRUST_PROXY 1" "1" "$(env_be TRUST_PROXY --set ingress.enabled=false --set app.publicUrl=https://pn.example.it)"
eq "impostato nei values: vince, una volta sola" "10.0.0.0/8" "$(env_be TRUST_PROXY --set backend.env.TRUST_PROXY=10.0.0.0/8)"
eq "RATE_LIMIT_MAX_REQUESTS del chart: 300 (il tetto di prima)" "300" "$(env_be RATE_LIMIT_MAX_REQUESTS)"
docker compose -f "$R/docker-compose.yml" config --format json > "$T/c.json" 2>/dev/null
eq "compose: backend TRUST_PROXY 1, porta 3001 solo su 127.0.0.1" "1|127.0.0.1" "$(python3 -c '
import json,sys; b=json.load(open(sys.argv[1]))["services"]["backend"]
print(b["environment"].get("TRUST_PROXY","-")+"|"+",".join(p.get("host_ip","0.0.0.0") for p in b.get("ports",[])))' "$T/c.json")"

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
