#!/usr/bin/env bash
# Smoke test del blocco U8e: ricerca senza badare ad accenti e maiuscole.
#
#   A. API, sul database indicato (in produzione la collation e' C: lower() non
#      abbassa le lettere accentate). «caffe» trova «Caffè», «CITTA» trova
#      «Città», «l'uliveto» trova «L’Uliveto» (apostrofo tipografico); % e _
#      restano caratteri. Pagina Controparti (/anagrafiche/elenco), selettore
#      (/anagrafiche/cerca), Registro (/movimenti?search=, anche descrizione e
#      note), export dei movimenti, suggerimenti delle categorie.
#   B. browser: la ricerca della pagina Controparti con «caffe», 1366 e 390 px.
#
#   API=http://127.0.0.1:33530/api DB_CONTAINER=pn-u8d-db DB_NAME=pn_c ./scripts/smoke/u8e-ricerca.sh
#
# Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T="$(mktemp -d)"; NGX="u8eweb-$SFX"
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
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | tok; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"$2\"}" | tok; }
uid() { q "SELECT id FROM utenti WHERE username='$1'"; }
conto() { q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('$1', 'X', $2, $3) RETURNING id"; }
tipologia() { q "INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, colore) VALUES ($1, '$2', '$3', '$4') RETURNING id"; }
anag() { q "INSERT INTO anagrafiche (nome, user_id, tipologia_id) VALUES ('$1', $2, ${3:-NULL}) RETURNING id"; }
# mv <giorno-relativo> <conto> <descr> <importo> <tipo> <utente> <anagrafica|NULL> <categoria|NULL>
mv() { q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id, anagrafica_id, categoria) VALUES (CURRENT_DATE - $1, $2, '$3', $4, '$5', $6, $7, $8) RETURNING id"; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}
anag() { q "INSERT INTO anagrafiche (nome, user_id, piva) VALUES (\$n\$$1\$n\$, $2, ${3:-NULL}) RETURNING id"; }
nomi() { hit "$@" >/dev/null; py "print(','.join(sorted(a['nome'] for a in d['anagrafiche'])))"; }
cerca() { hit "$@" >/dev/null; py "print(','.join(sorted(a['nome'] for a in d['risultati'])))"; }
descr() { hit "$@" >/dev/null; py "print(','.join(sorted(m['descrizione'] for m in d['movimenti'])))"; }

echo "=== setup (suffisso $SFX) ==="
U="u8eu$SFX"; V="u8ev$SFX"; UT=$(reg_u "$U"); VT=$(reg_u "$V")
[ -n "$UT" ] && [ -n "$VT" ] || { echo "registrazioni non riuscite"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); UID_=$(uid "$U"); VID=$(uid "$V")
echo "  collation del database: $(q "SELECT datcollate FROM pg_database WHERE datname = current_database()")"
A1=$(anag 'Caffè Quarta spa' "$UID_"); A2=$(anag 'CITTÀ DI LECCE' "$UID_"); A3=$(anag 'L’Uliveto' "$UID_")
A4=$(anag 'Sconto 50%' "$UID_"); A5=$(anag 'Sconto 500' "$UID_"); A6=$(anag 'Perù Import' "$UID_" "'IT01234567890'")
anag 'Caffè di V' "$VID" >/dev/null
C1=$(conto Banca 0 "$UID_")
mv 1 "$C1" 'Fornitura caffè' 10 Uscita "$UID_" "$A6" NULL >/dev/null
mv 2 "$C1" 'Tassa' 20 Uscita "$UID_" "$A2" NULL >/dev/null
M3=$(mv 3 "$C1" 'Varie' 30 Uscita "$UID_" NULL NULL); q "UPDATE movimenti SET note = 'pagato in CITTÀ' WHERE id = $M3" >/dev/null
q "INSERT INTO categorie_anagrafiche (user_id, nome) VALUES ($UID_, 'Pubblicità')" >/dev/null
q "INSERT INTO categorie_movimenti (user_id, nome, tipo) VALUES ($UID_, 'Caffè e bar', 'Uscita')" >/dev/null

echo
echo "=== A. API ==="
EL="$API/anagrafiche/elenco"
eq "elenco «caffe»: Caffè Quarta (non quello di V)" "Caffè Quarta spa" "$(nomi "${AU[@]}" "$EL?q=caffe")"
eq "elenco «CAFFÈ»: Caffè Quarta" "Caffè Quarta spa" "$(nomi "${AU[@]}" "$EL?q=CAFF%C3%88")"
eq "elenco «citta»: CITTÀ DI LECCE" "CITTÀ DI LECCE" "$(nomi "${AU[@]}" "$EL?q=citta")"
eq "elenco «città»: CITTÀ DI LECCE" "CITTÀ DI LECCE" "$(nomi "${AU[@]}" "$EL?q=citt%C3%A0")"
eq "elenco «l'uliveto» (apostrofo dritto): L’Uliveto" "L’Uliveto" "$(nomi "${AU[@]}" "$EL?q=l%27uliveto")"
eq "elenco «peru»: Perù Import" "Perù Import" "$(nomi "${AU[@]}" "$EL?q=peru")"
eq "elenco per P.IVA «01234»: Perù Import" "Perù Import" "$(nomi "${AU[@]}" "$EL?q=01234")"
eq "elenco «50%»: % resta un carattere" "Sconto 50%" "$(nomi "${AU[@]}" "$EL?q=50%25")"
eq "elenco «sconto 50_»: _ resta un carattere" "" "$(nomi "${AU[@]}" "$EL?q=sconto%2050_")"
eq "selettore /cerca «caffe»" "Caffè Quarta spa" "$(cerca "${AU[@]}" "$API/anagrafiche/cerca?q=caffe")"
eq "selettore /cerca «citta»" "CITTÀ DI LECCE" "$(cerca "${AU[@]}" "$API/anagrafiche/cerca?q=citta")"
eq "Registro «caffe»: descrizione «Fornitura caffè»" "Fornitura caffè" "$(descr "${AU[@]}" "$API/movimenti?search=caffe")"
eq "Registro «citta»: controparte CITTÀ e nota «in CITTÀ»" "Tassa,Varie" "$(descr "${AU[@]}" "$API/movimenti?search=citta")"
eq "Registro «peru»: per nome della controparte" "Fornitura caffè" "$(descr "${AU[@]}" "$API/movimenti?search=peru")"
eq "Registro «%»: nessun jolly" "" "$(descr "${AU[@]}" "$API/movimenti?search=%25")"
eq "export dei movimenti «citta»: 2 righe" "200|2" "$(hit "${AU[@]}" "$API/movimenti/export?formato=csv&search=citta")|$(python3 -c "
import csv,io;print(len(list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())))))")"
eq "suggerimenti categorie controparti «pubblicita»" "Pubblicità" "$(hit "${AU[@]}" "$API/categorie-anagrafiche/suggestions?q=pubblicita" >/dev/null; py "print(','.join(x if isinstance(x,str) else (x.get('nome') or x.get('categoria')) for x in (d if isinstance(d,list) else d.get('suggerimenti',[]))))")"
eq "suggerimenti categorie movimenti «caffe»" "Caffè e bar" "$(hit "${AU[@]}" "$API/categorie-movimenti/suggestions?q=caffe&tipo=Uscita" >/dev/null; py "print(','.join(x if isinstance(x,str) else (x.get('nome') or x.get('categoria')) for x in (d if isinstance(d,list) else d.get('suggerimenti',[]))))")"
eq "V con «caffe»: solo il suo" "Caffè di V" "$(nomi "${AV[@]}" "$EL?q=caffe")"

echo
echo "=== B. build e browser ==="
echo "=== B. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" \
  browser node "$R/scripts/smoke/lib/u8e-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
