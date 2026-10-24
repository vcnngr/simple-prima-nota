#!/usr/bin/env bash
# Smoke test del blocco K5: deploy.
#
#   A. il backend in produzione non parte con JWT_SECRET mancante, di esempio,
#      corto o ripetitivo; parte con uno vero; fuori produzione avvisa e parte.
#   B. docker compose: senza JWT_SECRET si ferma con un messaggio; il valore del
#      file .env arriva al backend; /.env escluso da git.
#   C. immagine del backend: niente .env ne' node_modules della macchina nel
#      contesto; con il segreto di esempio il container si ferma.
#   D. immagine del frontend: CSP senza http:/https: generici ne' script in linea,
#      Referrer-Policy same-origin, index.html senza <script> in linea, niente
#      mappe dei sorgenti; Chrome headless apre le pagine pubbliche senza
#      violazioni della CSP (e le vede, con una CSP volutamente piu' stretta);
#      copia del chart identica al modello.
#
#   ./scripts/smoke/k5-deploy.sh
#
# Richiede node, docker e Google Chrome. Non serve il database.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
S=pn-k5-$$
T="$(mktemp -d)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
IMG_NGINX=docker.io/library/nginx:1.30-alpine
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  OK    $1"; }
ko() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; [ -n "${2:-}" ] && echo "         $2"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "atteso=$2 ottenuto=$3"; fi; }
pulisci() {
  [ -f "$T/pids" ] && kill $(cat "$T/pids") 2>/dev/null
  docker rm -f $(docker ps -aq --filter "name=^$S-") >/dev/null 2>&1
  docker rmi "$S-be" "$S-fe" >/dev/null 2>&1
  rm -f "$R/backend/.env.k5-marcatore"
  rm -rf "$T"
}
trap pulisci EXIT
porta_libera() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
BUONO=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')

echo "=== A. avvio del backend ==="
# avvia <descrizione> <atteso: parte|fermo> <NODE_ENV> <JWT_SECRET o -unset->
avvia() {
  local desc="$1" atteso="$2" ne="$3" js="$4" p; p=$(porta_libera)
  local envs=(PATH="$PATH" HOME="$HOME" NODE_ENV="$ne" PORT="$p" DB_HOST=127.0.0.1 DB_PORT=1)
  [ "$js" != "-unset-" ] && envs+=(JWT_SECRET="$js")
  (cd "$R/backend" && exec env -i "${envs[@]}" node server.js) > "$T/a-$p.log" 2>&1 < /dev/null &
  local pid=$!; echo $pid >> "$T/pids"
  local stato=fermo
  for _ in $(seq 1 20); do
    if curl -s --max-time 1 -o /dev/null "http://127.0.0.1:$p/api/health"; then stato=parte; break; fi
    kill -0 $pid 2>/dev/null || break
    sleep 0.3
  done
  kill $pid 2>/dev/null
  if [ "$stato" = "$atteso" ]; then ok "$desc: $stato"; else ko "$desc" "atteso=$atteso ottenuto=$stato — $(head -c 200 "$T/a-$p.log")"; fi
  cp "$T/a-$p.log" "$T/ultimo.log"
}
avvia "produzione, JWT_SECRET mancante" fermo production -unset-
eq "  con il motivo nel log" "1" "$(grep -c 'Avvio rifiutato: .*JWT_SECRET non impostato' "$T/ultimo.log")"
avvia "produzione, segreto di docker-compose.yml di prima" fermo production "your-super-secret-jwt-key-change-in-production"
avvia "produzione, segreto di .env.example" fermo production "your-super-secret-jwt-key-change-in-production-please"
avvia "produzione, segreto di 20 caratteri" fermo production "Ab3dE6gH9jK2mN5pQ8sT"
avvia "produzione, 40 volte la stessa lettera" fermo production "$(printf 'a%.0s' $(seq 1 40))"
avvia "produzione, segreto casuale di 64 caratteri" parte production "$BUONO"
avvia "sviluppo, segreto corto" parte development "k5"
eq "  con l'avviso nel log" "1" "$(grep -c 'ATTENZIONE: JWT_SECRET troppo corto' "$T/ultimo.log")"

echo
echo "=== B. docker compose ==="
(cd "$T" && env -u JWT_SECRET docker compose -f "$R/docker-compose.yml" --project-directory "$T" config >/dev/null 2>"$T/c.err")
eq "senza JWT_SECRET: compose si ferma" "1" "$(grep -c 'imposta JWT_SECRET nel file .env' "$T/c.err")"
echo "JWT_SECRET=$BUONO" > "$T/.env"
eq "con il file .env: il segreto arriva al backend" "$BUONO" \
  "$(env -u JWT_SECRET docker compose -f "$R/docker-compose.yml" --project-directory "$T" config --format json 2>/dev/null \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["services"]["backend"]["environment"]["JWT_SECRET"])' 2>/dev/null)"
eq "/.env escluso da git" "si" "$(cd "$R" && touch .env.k5prova && git check-ignore -q .env && echo si || echo no; rm -f .env.k5prova)"

echo
echo "=== C. immagine del backend ==="
echo "MARCATORE=k5" > "$R/backend/.env.k5-marcatore"
if docker build -q -t "$S-be" "$R/backend" > "$T/be-build.log" 2>&1; then
  ok "immagine costruita"
  eq "niente .env della macchina nell'immagine" "0" "$(docker run --rm "$S-be" sh -c 'ls -a /app | grep -c "^\.env"')"
  eq "node_modules installati nell'immagine (non copiati): nodemailer carica" "ok" \
    "$(docker run --rm "$S-be" node -e 'require("nodemailer");console.log("ok")' 2>&1 | tail -1)"
  eq "contesto senza node_modules: nessun symlink o binario della macchina" "0" \
    "$(docker run --rm "$S-be" sh -c 'find /app/node_modules -maxdepth 1 -type l | wc -l' | tr -d ' ')"
  docker run --name "$S-be-run" -e NODE_ENV=production -e JWT_SECRET=your-super-secret-jwt-key-change-in-production "$S-be" > "$T/be-run.log" 2>&1
  eq "container con il segreto di esempio: si ferma con errore" "1|1" \
    "$(docker inspect -f '{{.State.ExitCode}}' "$S-be-run")|$(grep -c 'Avvio rifiutato' "$T/be-run.log")"
else
  ko "immagine costruita" "$(tail -5 "$T/be-build.log")"
fi

echo
echo "=== D. immagine del frontend e CSP ==="
if docker build -q -t "$S-fe" "$R/web" > "$T/fe-build.log" 2>&1; then
  ok "immagine costruita"
  PF=$(porta_libera)
  docker run -d --name "$S-fe-run" -p "127.0.0.1:$PF:80" -e BACKEND_UPSTREAM=127.0.0.1:9 "$S-fe" >/dev/null
  for _ in $(seq 1 20); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PF/" && break; sleep 0.3; done
  curl -sI "http://127.0.0.1:$PF/accedi" > "$T/h"
  CSP=$(grep -i '^content-security-policy:' "$T/h" | tr -d '\r')
  eq "CSP: script solo da 'self'" "1" "$(echo "$CSP" | grep -c "script-src 'self';")"
  eq "CSP: nessuna sorgente http:/https: generica" "0" "$(echo "$CSP" | grep -cE "(^| )https?:( |;|$)")"
  eq "CSP: object-src none, frame-ancestors self, base-uri self" "3" \
    "$(echo "$CSP" | grep -oE "object-src 'none'|frame-ancestors 'self'|base-uri 'self'" | wc -l | tr -d ' ')"
  eq "Referrer-Policy same-origin" "1" "$(grep -ci '^referrer-policy: same-origin' "$T/h")"
  curl -s "http://127.0.0.1:$PF/" > "$T/index.html"
  eq "index.html: nessuno <script> in linea" "0" "$(grep -oE '<script[^>]*>' "$T/index.html" | grep -vc 'src=')"
  eq "nessuna mappa dei sorgenti pubblicata" "0" "$(docker exec "$S-fe-run" sh -c 'find /usr/share/nginx/html -name "*.map" | wc -l' | tr -d ' ')"
  # Chrome: la pagina si disegna e la console non riporta violazioni della CSP.
  pagina() {  # pagina <nome> <url> -> "<disegnata>|<violazioni>"
    rm -rf "$T/chrome-$1"
    perl -e 'alarm 20; exec @ARGV' "$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$T/chrome-$1" \
      --enable-logging=stderr --v=1 --virtual-time-budget=5000 --dump-dom "$2" > "$T/$1.html" 2> "$T/$1.err"
    echo "$(grep -q '<form' "$T/$1.html" && echo 1 || echo 0)|$(grep -c 'Content Security Policy' "$T/$1.err")"
  }
  for pg in accedi studio/accedi registrati studio/registrati password-dimenticata; do
    eq "Chrome, /$pg: disegnata, 0 violazioni CSP" "1|0" "$(pagina "p${pg//\//_}" "http://127.0.0.1:$PF/$pg")"
  done
  # Controprova: la stessa build con style-src senza 'unsafe-inline' deve dare
  # violazioni, altrimenti il controllo sopra non vedrebbe niente.
  docker exec "$S-fe-run" sh -c "sed -i \"s/style-src 'self' 'unsafe-inline'/style-src 'self'/\" /etc/nginx/conf.d/default.conf && nginx -s reload" >/dev/null 2>&1
  sleep 1
  V=$(pagina neg "http://127.0.0.1:$PF/accedi")
  eq "controprova: CSP piu' stretta -> violazioni viste" "si" "$([ "${V#*|}" -gt 0 ] 2>/dev/null && echo si || echo "no ($V)")"
  pkill -f "$T/chrome-" 2>/dev/null
else
  ko "immagine costruita" "$(tail -5 "$T/fe-build.log")"
fi
eq "copia del chart identica al modello nginx" "si" \
  "$(cmp -s "$R/web/nginx/default.conf.template" "$R/helm-chart/files/nginx/default.conf.template" && echo si || echo no)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
