#!/usr/bin/env bash
# Smoke test del blocco S4: nginx del frontend deploy-neutral e una sola versione
# di PostgreSQL.
#
# Verifica:
#   A. una sola configurazione nginx (frontend/nginx/default.conf.template), copiata
#      nel chart e senza indirizzi DNS scritti dentro;
#   B. l'immagine del frontend costruita dal checkout, su una rete Docker con un
#      finto backend chiamato "backend" come in compose: /api arriva al backend,
#      un allegato da 5 MB passa, uno da 12 MB si ferma in nginx (413), index.html
#      e le rotte si riconvalidano, /static/ e' immutabile, uno script che non
#      esiste e' 404, le intestazioni di sicurezza ci sono su ogni risposta;
#   C. il chart: configurazione e variabili del Deployment renderizzato montate su
#      nginx:1.30-alpine e sull'immagine gia' pubblicata, con il finto backend
#      raggiungibile con il nome FQDN del Service; tetto calcolato da
#      ALLEGATI_MAX_BYTES (10 MB -> 11m, 20 MB -> 21m);
#   D. PostgreSQL: compose, CloudNativePG, job delle migrazioni e database
#      standalone sulla stessa immagine 16.15; migra.sh su 16.15 vuoto; un volume
#      creato dal 15 non parte con il 16 e resta leggibile dal 15.
#
#   ./scripts/smoke/s4-deploy.sh
#
# IMG_FRONTEND=<immagine> salta la build di B. IMG_PUBBLICATA (default
# docker.io/vcnngr/pnfrontend:latest) vuota salta la prova sull'immagine pubblicata.
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMG_NGINX=docker.io/library/nginx:1.30-alpine
IMG_NODE=docker.io/library/node:18-alpine
IMG_PG=docker.io/library/postgres:16.15
IMG_PG15=docker.io/library/postgres:15-alpine
IMG_PUBBLICATA="${IMG_PUBBLICATA-docker.io/vcnngr/pnfrontend:latest}"
S=pn-s4-$$
NET=$S-net
T="$(mktemp -d)"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  OK    $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "         $2"; }
eq()   { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "atteso=$2 ottenuto=$3"; fi; }
contiene() { if printf '%s' "$3" | grep -qiF -- "$2"; then ok "$1"; else ko "$1" "manca «$2» in: $(printf '%s' "$3" | head -c 300)"; fi; }

pulisci() {
  docker rm -f $(docker ps -aq --filter "name=^$S-") >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  docker volume rm "$S-pg15" >/dev/null 2>&1
  [ -n "${IMG_COSTRUITA:-}" ] && docker rmi "$IMG_COSTRUITA" >/dev/null 2>&1
  rm -rf "$T"
}
trap pulisci EXIT

docker network create "$NET" >/dev/null

# Finto backend: risponde con il percorso, i byte ricevuti e X-Forwarded-For.
cat > "$T/stub.js" <<'EOF'
require('http').createServer((q, r) => {
  let n = 0;
  q.on('data', c => { n += c.length; });
  q.on('end', () => {
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify({ path: q.url, bytes: n }));
  });
}).listen(3001);
EOF
stub() { # stub <nome> <alias>
  docker rm -f "$S-$1" >/dev/null 2>&1
  docker run -d --name "$S-$1" --network "$NET" --network-alias "$2" \
    -v "$T/stub.js:/stub.js:ro" "$IMG_NODE" node /stub.js >/dev/null
}
porta() { docker port "$1" 80/tcp | head -1 | sed 's/.*://'; }
pronto() { # pronto <porta>
  for _ in $(seq 1 30); do
    curl -s --max-time 2 "http://127.0.0.1:$1/health" | grep -q healthy && return 0; sleep 1
  done
  return 1
}
head -c 5000000 /dev/zero > "$T/5mb.bin"
head -c 12000000 /dev/zero > "$T/12mb.bin"
head -c 15000000 /dev/zero > "$T/15mb.bin"
head -c 23000000 /dev/zero > "$T/23mb.bin"
invia() { # invia <porta> <file> -> codice|byte arrivati al backend
  curl -s --max-time 30 -o "$T/r" -w '%{http_code}' -F "file=@$2" "http://127.0.0.1:$1/api/messaggi/allegati?collegamentoId=1" > "$T/c"
  echo "$(cat "$T/c")|$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1]))["bytes"] > 0)
except Exception: print("-")' "$T/r")"
}
intestazione() { # intestazione <porta> <percorso> <nome>
  curl -s --max-time 10 -o /dev/null -D - "http://127.0.0.1:$1$2" | tr -d '\r' \
    | awk -v k="$(echo "$3" | tr 'A-Z' 'a-z')" -F': ' 'tolower($1)==k {print $2}' | paste -sd'|' -
}
api() { curl -s --max-time 10 "http://127.0.0.1:$1/api/health"; }

# ------------------------------------------------------------------------------
echo "=== A. una sola configurazione nginx ==="
TPL="$R/frontend/nginx/default.conf.template"
eq "frontend/nginx.conf tolto" "0" "$([ -e "$R/frontend/nginx.conf" ] && echo 1 || echo 0)"
eq "modello presente" "1" "$([ -s "$TPL" ] && echo 1 || echo 0)"
"$R/scripts/sincronizza-helm-db.sh" --verifica > "$T/sync" 2>&1
eq "copia nel chart allineata (sincronizza --verifica)" "0" "$?"
eq "nessun DNS scritto (niente 10.89.0.1, niente kube-dns)" "0" "$(grep -cE 'resolver +[0-9]|kube-dns' "$TPL" 2>/dev/null)"
eq "il chart non ha piu' un nginx suo" "0" "$(grep -c 'server {' "$R/helm-chart/templates/configmap.yaml")"
eq "il Dockerfile usa il modello" "1" "$(grep -c 'nginx/default.conf.template /etc/nginx/templates/' "$R/frontend/Dockerfile")"

# ------------------------------------------------------------------------------
echo
echo "=== B. immagine del frontend (compose) ==="
IMG="${IMG_FRONTEND:-}"
if [ -z "$IMG" ]; then
  IMG_COSTRUITA="pn-s4-frontend:$$"; IMG="$IMG_COSTRUITA"
  docker build -q -t "$IMG" "$R/frontend" > "$T/build" 2>&1
  eq "build dell'immagine" "0" "$?"
  [ -s "$T/build" ] && tail -3 "$T/build" | grep -i error
fi
docker compose -f "$R/docker-compose.yml" config > "$T/compose.yml" 2>"$T/compose.err"
eq "docker compose config" "0" "$?"
eq "compose: frontend verso il servizio backend" "1" "$(grep -c 'BACKEND_UPSTREAM: backend:3001' "$T/compose.yml")"
stub be backend
docker run -d --name "$S-img" --network "$NET" -p 127.0.0.1::80 "$IMG" >/dev/null
P=$(porta "$S-img")
pronto "$P"; eq "nginx risponde (/health)" "0" "$?"
contiene "/api arriva al backend" '"path":"/api/health"' "$(api "$P")"
eq "allegato da 5 MB: arriva al backend" "200|True" "$(invia "$P" "$T/5mb.bin")"
eq "allegato da 12 MB: fermato da nginx" "413|-" "$(invia "$P" "$T/12mb.bin")"
eq "index.html: si riconvalida" "no-cache" "$(intestazione "$P" / Cache-Control)"
eq "rotta dell'app: si riconvalida" "no-cache" "$(intestazione "$P" /movimenti Cache-Control)"
contiene "rotta dell'app: e' la pagina" "text/html" "$(intestazione "$P" /movimenti Content-Type)"
JS=$(docker exec "$S-img" sh -c 'ls /usr/share/nginx/html/static/js/main.*.js | head -1' | sed 's#.*/html##')
eq "script con hash: immutabile" "public, max-age=31536000, immutable" "$(intestazione "$P" "$JS" Cache-Control)"
eq "script che non esiste: 404" "404" "$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$P/static/js/non-esiste.js")"
eq "nosniff anche sulle pagine con Cache-Control" "nosniff|nosniff" "$(intestazione "$P" / X-Content-Type-Options)|$(intestazione "$P" "$JS" X-Content-Type-Options)"
eq "API: nessun Cache-Control aggiunto da nginx" "" "$(intestazione "$P" /api/health Cache-Control)"
eq "versione di nginx nascosta" "nginx" "$(intestazione "$P" / Server)"
docker rm -f "$S-be" >/dev/null
docker run -d --name "$S-be2" --network "$NET" --network-alias backend -v "$T/stub.js:/stub.js:ro" "$IMG_NODE" node /stub.js >/dev/null
sleep 2
contiene "backend ricreato con un altro indirizzo: raggiunto" '"path":"/api/health"' "$(api "$P")"

# ------------------------------------------------------------------------------
echo
echo "=== C. chart Helm ==="
rende() { # rende <prefisso> [--set ...]: configurazione e variabili del frontend renderizzati
  local p=$1; shift
  helm template t "$R/helm-chart" "$@" > "$T/$p.yaml" 2>"$T/$p.err" || return 1
  python3 - "$T/$p.yaml" "$T/$p" <<'EOF'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
cm = next(d for d in docs if d['kind'] == 'ConfigMap' and d['metadata']['name'].endswith('-config'))
dep = next(d for d in docs if d['kind'] == 'Deployment' and d['metadata']['name'].endswith('-frontend'))
c = dep['spec']['template']['spec']['containers'][0]
m = next(v for v in c['volumeMounts'] if v['name'] == 'nginx-config')
open(sys.argv[2] + '.tpl', 'w').write(cm['data']['default.conf.template'])
open(sys.argv[2] + '.env', 'w').write(''.join(f"{e['name']}={e['value']}\n" for e in c['env']))
open(sys.argv[2] + '.mount', 'w').write(m['mountPath'])
EOF
}
avvia_chart() { # avvia_chart <nome> <prefisso> <immagine>
  mkdir -p "$T/$2.d"; cp "$T/$2.tpl" "$T/$2.d/default.conf.template"
  docker run -d --name "$S-$1" --network "$NET" -p 127.0.0.1::80 --env-file "$T/$2.env" \
    -v "$T/$2.d:$(cat "$T/$2.mount"):ro" "$3" >/dev/null
}
rende c1; eq "helm template (default)" "0" "$?"
eq "montato come modello" "/etc/nginx/templates" "$(cat "$T/c1.mount" 2>/dev/null)"
eq "configurazione del chart = modello del frontend" "0" "$(cmp -s "$T/c1.tpl" "$TPL"; echo $?)"
FQDN=$(sed -n 's/^BACKEND_UPSTREAM=\(.*\):3001$/\1/p' "$T/c1.env")
eq "BACKEND_UPSTREAM: FQDN del Service" "t-simple-prima-nota-backend.default.svc.cluster.local" "$FQDN"
eq "CLIENT_MAX_BODY_SIZE con 10 MB di allegati" "11m" "$(sed -n 's/^CLIENT_MAX_BODY_SIZE=//p' "$T/c1.env")"
stub bek "$FQDN"
avvia_chart k1 c1 "$IMG_NGINX"; P=$(porta "$S-k1")
pronto "$P"; eq "nginx:1.30-alpine con la configurazione del chart" "0" "$?"
contiene "/api arriva al Service del backend" '"path":"/api/health"' "$(api "$P")"
eq "allegato da 5 MB: arriva (prima: 413)" "200|True" "$(invia "$P" "$T/5mb.bin")"
eq "allegato da 12 MB: 413" "413|-" "$(invia "$P" "$T/12mb.bin")"
eq "index.html: si riconvalida (prima: max-age=3600)" "no-cache" "$(intestazione "$P" / Cache-Control)"

rende c2 --set backend.env.ALLEGATI_MAX_BYTES=20971520
eq "CLIENT_MAX_BODY_SIZE con 20 MB di allegati" "21m" "$(sed -n 's/^CLIENT_MAX_BODY_SIZE=//p' "$T/c2.env")"
avvia_chart k2 c2 "$IMG_NGINX"; P=$(porta "$S-k2"); pronto "$P"
eq "20 MB: 15 MB passano" "200|True" "$(invia "$P" "$T/15mb.bin")"
eq "20 MB: 23 MB no" "413|-" "$(invia "$P" "$T/23mb.bin")"

if [ -n "$IMG_PUBBLICATA" ] && docker pull -q "$IMG_PUBBLICATA" >/dev/null 2>&1; then
  avvia_chart k3 c1 "$IMG_PUBBLICATA"; P=$(porta "$S-k3")
  pronto "$P"; eq "immagine gia' pubblicata con il chart nuovo: parte" "0" "$?"
  contiene "immagine pubblicata: /api arriva al backend" '"path":"/api/health"' "$(api "$P")"
  eq "immagine pubblicata: 5 MB passano" "200|True" "$(invia "$P" "$T/5mb.bin")"
else
  echo "  --    immagine pubblicata non disponibile: prova saltata"
fi

# ------------------------------------------------------------------------------
echo
echo "=== D. PostgreSQL ==="
senza_commenti() { grep -vE '^[[:space:]]*#' "$@"; }
V=$( { senza_commenti "$R/docker-compose.yml" "$R/helm-chart/values.yaml" | grep -oE 'postgres(ql)?:[0-9][0-9.]*'
       senza_commenti "$R/helm-chart/values.yaml" | grep -oE 'tag: "1[0-9][^"]*"' | sed 's/tag: "\([0-9.]*\).*/postgres:\1/'
     } | sed 's/.*://' | sort -u | paste -sd' ' -)
eq "una sola versione in compose, CloudNativePG, job e standalone" "16.15" "$V"
eq "README: niente PostgreSQL 15" "0" "$(grep -c 'PostgreSQL 15' "$R/README.md")"
helm template t "$R/helm-chart" --set postgresql.enabled=true --set cloudnativepg.enabled=false > "$T/sa.yaml" 2>&1
eq "chart standalone: immagine 16.15" "docker.io/postgres:16.15" "$(grep -oE 'image: "docker.io/postgres:[^"]*"' "$T/sa.yaml" | head -1 | sed 's/image: "//; s/"$//')"
eq "chart CloudNativePG: immagine 16.15" "1" "$(helm template t "$R/helm-chart" | grep -c 'imageName: ghcr.io/cloudnative-pg/postgresql:16.15')"

docker run -d --name "$S-pg" --network "$NET" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=prima_nota "$IMG_PG" >/dev/null
for _ in $(seq 1 40); do docker exec "$S-pg" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
docker run --rm --network "$NET" -e PGHOST="$S-pg" -e PGUSER=postgres -e PGPASSWORD=pw -e PGDATABASE=prima_nota \
  -v "$R/database:/database:ro" "$IMG_PG" bash /database/migra.sh > "$T/migra" 2>&1
eq "migra.sh su 16.15 vuoto: exit 0" "0" "$?"
ULTIMA=$(cd "$R/database/migrations" && ls [0-9][0-9][0-9]_*.sql | grep -v _down | tail -1 | cut -c1-3)
eq "registro all'ultima migrazione ($ULTIMA)" "$ULTIMA" "$(docker exec "$S-pg" psql -U postgres -d prima_nota -tAc 'SELECT max(versione) FROM schema_migrazioni')"

docker volume create "$S-pg15" >/dev/null
docker run -d --name "$S-p15" -e POSTGRES_PASSWORD=pw -v "$S-pg15:/var/lib/postgresql/data" "$IMG_PG15" >/dev/null
for _ in $(seq 1 40); do docker exec "$S-p15" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$S-p15" psql -U postgres -tAc "CREATE TABLE prova AS SELECT 42 AS n" >/dev/null
docker stop "$S-p15" >/dev/null; docker rm "$S-p15" >/dev/null
docker run --name "$S-p16" -v "$S-pg15:/var/lib/postgresql/data" "$IMG_PG" > "$T/p16.log" 2>&1
eq "volume del 15 con il 16: non parte" "1" "$([ "$(docker inspect -f '{{.State.ExitCode}}' "$S-p16")" != 0 ] && echo 1 || echo 0)"
contiene "e dice perche'" "incompatible with server" "$(cat "$T/p16.log")"
docker run -d --name "$S-p15b" -e POSTGRES_PASSWORD=pw -v "$S-pg15:/var/lib/postgresql/data" "$IMG_PG15" >/dev/null
for _ in $(seq 1 40); do docker exec "$S-p15b" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break; sleep 1; done
# pg_isready su TCP: durante l'init il server temporaneo ascolta solo sul socket.
eq "di nuovo con il 15: dati intatti" "42" "$(docker exec "$S-p15b" psql -U postgres -tAc 'SELECT n FROM prova')"

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
