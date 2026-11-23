#!/usr/bin/env bash
# Smoke test del blocco U9b: estratti conto visti dallo studio (tavole 3 B + C).
#
#   GET /commercialisti/estratti (griglia clienti x mesi: righe, da descrivere,
#   estratti, saldo che torna o no; solo clienti collegati; ambito: conti ammessi
#   e date, niente controllo del saldo con una data d'inizio); GET
#   /commercialisti/clienti/:id/estratti?mese= (righe della banca e loro
#   movimento, accesso registrato, isolamento fra studi e clienti); chiarimento
#   su una riga; il cliente descrive e la griglia scende. Correzioni: ricerca con
#   accenti scritti a parte (NFD). Browser: griglia e righe a 1366 e 390 px,
#   «Chiedi», conto proposto per l'estratto (non la cassa).
#
#   API=http://127.0.0.1:33530/api DB_CONTAINER=pn-u9x-db ./scripts/smoke/u9b-studio.sh
set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T="$(mktemp -d)"; NGX="u9bweb-$SFX"
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
carica() { # carica <url> <token> <conto> <file> [mappa]
  local m=(); [ -n "${5:-}" ] && m=(--form-string "mappa=$5")
  hit -X POST -H "Authorization: Bearer $2" -F "file=@$4" --form-string "conto_id=$3" "${m[@]}" "$1"
}
FX="$R/scripts/smoke/dati/fineco-finto.xlsx"
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO\|^PRIMO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}

collega() { q "INSERT INTO collegamenti_commercialista (commercialista_id, user_id, stato, richiesto_da, data_richiesta, data_accettazione, data_collegamento) VALUES ((SELECT id FROM commercialisti WHERE username='$1'), $2, 'attiva', 'commercialista', now(), now(), now()) RETURNING id"; }

echo "=== setup (suffisso $SFX) ==="
U="u9bu$SFX"; V="u9bv$SFX"; W="u9bw$SFX"; X="u9bx$SFX"; S="u9bs$SFX"; S2="u9bt$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); WT=$(reg_u "$W"); XT=$(reg_u "$X")
ST=$(reg_c "$S" "Studio U9b $SFX"); S2T=$(reg_c "$S2" "Altro studio $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$WT" ] && [ -n "$XT" ] && [ -n "$ST" ] && [ -n "$S2T" ] || { echo "registrazioni non riuscite"; exit 1; }
UID_=$(uid "$U"); VID=$(uid "$V"); WID=$(uid "$W"); XID=$(uid "$X")
AS=(-H "Authorization: Bearer $ST"); AS2=(-H "Authorization: Bearer $S2T"); AU=(-H "Authorization: Bearer $UT")
# U: saldo che torna (0,50 + Enel gia' scritta); V: saldo diverso; W: due conti,
# l'ambito ammette solo A e parte dal 01/10 (niente controllo del saldo); X non collegato.
CU=$(conto Fineco 0.50 "$UID_"); CV=$(conto Fineco 0 "$VID"); CWA=$(conto "Banca A" 0 "$WID"); CWB=$(conto "Banca B" 0 "$WID"); CX=$(conto Fineco 0 "$XID")
q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ('2026-10-24', $CU, 'Bolletta Enel', 45.30, 'Uscita', $UID_) RETURNING id" >/dev/null
for p in "$UT $CU" "$VT $CV" "$WT $CWA" "$WT $CWB" "$XT $CX"; do set -- $p; carica "$API/estratti" "$1" "$2" "$FX" >/dev/null; done
LU=$(collega "$S" "$UID_"); LV=$(collega "$S" "$VID"); LW=$(collega "$S" "$WID")
q "UPDATE collegamenti_commercialista SET conti_ammessi = ARRAY[$CWA], ambito_dal = '2026-10-10' WHERE id = $LW RETURNING id" >/dev/null
eq "setup: 5 estratti caricati, U 3 da descrivere" "5|3" "$(q "SELECT (SELECT count(*) FROM estratti_conto WHERE user_id IN ($UID_,$VID,$WID,$XID))||'|'||(SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND da_descrivere)")"

echo "=== griglia ==="
G="$API/commercialisti/estratti"
eq "griglia: 200, 6 mesi fino a questo" "200|6|$(date +%Y-%m)" "$(hit "${AS[@]}" "$G")|$(py "print(len(d['mesi']),d['mesi'][-1],sep='|')")"
eq "solo i clienti collegati (U, V, W; non X)" "$U,$V,$W" "$(py "print(','.join(sorted(c['cliente'] for c in d['clienti'])))")"
cella() { py "c=[c for c in d['clienti'] if c['user_id']==$1][0]['celle'].get('2026-10');print('-' if c is None else '|'.join(str(c[k]) for k in ('righe','da_descrivere','estratti','saldo')))"; }
eq "U ottobre: 4 righe, 3 da descrivere, 1 estratto, saldo torna" "4|3|1|ok" "$(cella "$UID_")"
eq "V ottobre: saldo diverso" "4|4|1|diverso" "$(cella "$VID")"
eq "W ottobre: solo il conto A, righe dal 10/10, niente saldo" "2|2|1|None" "$(cella "$WID")"
eq "mese senza estratti: null" "None" "$(py "c=[c for c in d['clienti'] if c['user_id']==$UID_][0]['celle'];print(c[d['mesi'][0]] if d['mesi'][0]!='2026-10' else None)")"
eq "altro studio: nessun cliente" "200|0" "$(hit "${AS2[@]}" "$G")|$(py "print(len(d['clienti']))")"
eq "token dell'utente: 401" "401" "$(hit "${AU[@]}" "$G")"
eq "senza token: 401" "401" "$(hit "$G")"
eq "mesi=13: 400" "400" "$(hit "${AS[@]}" "$G?mesi=13")"
eq "griglia registrata come lista_clienti" "1" "$(q "SELECT count(*)>0 FROM accessi_commercialista WHERE commercialista_id=(SELECT id FROM commercialisti WHERE username='$S') AND tipo_accesso='lista_clienti'" | sed 's/t/1/')"

echo "=== estratti del cliente ==="
E="$API/commercialisti/clienti"
eq "U ottobre: 200, 4 righe, 3 da descrivere, estratto col saldo che torna" "200|4|3|1|ok" \
  "$(hit "${AS[@]}" "$E/$UID_/estratti?mese=2026-10")|$(py "print(d['totali']['righe'],d['totali']['da_descrivere'],len(d['estratti']),d['estratti'][0]['saldo'],sep='|')")"
eq "righe col testo della banca e la riga Enel descritta (abbinata)" "abbinata|False|Bolletta Enel" \
  "$(py "x=[r for r in d['righe'] if r['esito']=='abbinata'][0];print(x['esito'],x['da_descrivere'],x['movimento']['descrizione'],sep='|')")"
MOV=$(py "print([r for r in d['righe'] if r['da_descrivere']][0]['movimento']['id'])")
eq "W: solo il conto A, dal 10/10" "2|Banca A" "$(hit "${AS[@]}" "$E/$WID/estratti?mese=2026-10" >/dev/null; py "print(len(d['righe']),','.join(sorted({r['conto'] for r in d['righe']})),sep='|')")"
eq "V: saldo diverso con l'importo della banca" "diverso|1019.25" "$(hit "${AS[@]}" "$E/$VID/estratti?mese=2026-10" >/dev/null; py "print(d['estratti'][0]['saldo'],d['estratti'][0]['saldo_file'],sep='|')")"
eq "X non collegato: rifiutato" "1" "$(c=$(hit "${AS[@]}" "$E/$XID/estratti?mese=2026-10"); [ "$c" = 403 ] || [ "$c" = 404 ] && echo 1 || echo "$c")"
eq "altro studio su U: rifiutato" "1" "$(c=$(hit "${AS2[@]}" "$E/$UID_/estratti"); [ "$c" = 403 ] || [ "$c" = 404 ] && echo 1 || echo "$c")"
eq "mese non valido: 400" "400" "$(hit "${AS[@]}" "$E/$UID_/estratti?mese=2026-13")"
eq "accesso registrato come dettaglio_cliente" "1" "$(q "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$LU AND tipo_accesso='dettaglio_cliente' AND dettagli ? 'estratti'" | sed 's/^[1-9][0-9]*$/1/')"
eq "chiarimento su una riga da descrivere: 201" "201" "$(hit -X POST "${AS[@]}" "${JSON[@]}" "$API/messaggi?userId=$UID_" -d "{\"messaggio\":\"Cos'e'?\",\"movimento_id\":$MOV,\"chiarimento\":true}")"
eq "la riga ora e' «chiarimento chiesto»" "True" "$(hit "${AS[@]}" "$E/$UID_/estratti?mese=2026-10" >/dev/null; py "print([r for r in d['righe'] if r['movimento'] and r['movimento']['id']==$MOV][0]['da_chiarire'])")"
eq "il cliente descrive: 200" "200" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/movimenti/$MOV" -d '{"note":"spiegato","categoria":"Prova"}')"
eq "griglia: U ottobre ora 2 da descrivere" "4|2|1|ok" "$(hit "${AS[@]}" "$G" >/dev/null; cella "$UID_")"
eq "movimento cancellato dal cliente: la riga torna da descrivere" "3" "$(hit -X DELETE "${AU[@]}" "$API/movimenti/$MOV" >/dev/null; hit "${AS[@]}" "$G" >/dev/null; py "print([c for c in d['clienti'] if c['user_id']==$UID_][0]['celle']['2026-10']['da_descrivere'])")"

echo "=== correzioni ==="
q "INSERT INTO anagrafiche (nome, user_id) VALUES (E'Caffé Nfd', $UID_), ('Città Nfc', $UID_) RETURNING id" >/dev/null
nomi() { hit "${AU[@]}" "$API/anagrafiche/elenco?q=$1" >/dev/null; py "print(','.join(sorted(a['nome'] for a in d['anagrafiche'])))"; }
eq "ricerca «caffe» trova il nome con l'accento scritto a parte" "Caffé Nfd" "$(nomi caffe | python3 -c 'import sys,unicodedata;print(unicodedata.normalize("NFC",sys.stdin.read().strip()))')"
eq "ricerca con l'accento scritto a parte («citta» + U+0300) trova «Città»" "Città Nfc" "$(nomi "citta%CC%80")"


echo "=== browser (build, nginx con la CSP) ==="
# Cliente con Cassa per prima e poi la banca: l'estratto propone la banca.
Y="u9by$SFX"; YT=$(reg_u "$Y"); YID=$(uid "$Y")
conto Cassa 0 "$YID" >/dev/null; CY=$(conto Fineco 0 "$YID")
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
# Stato di partenza del browser: la riga del chiarimento API e' stata cancellata, U ha 3 da descrivere.
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" STUDIO="$ST" CLIENTE="$UID_" UTENTE="$YT" CONTO_BANCA="$CY" \
  browser node "$R/scripts/smoke/lib/u9b-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
