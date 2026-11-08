#!/usr/bin/env bash
# Smoke test del blocco U7b: piu' conti insieme nel Registro.
#
#   A. API: GET /movimenti?conti=3,5 (righe e saldo progressivo dei soli conti
#      scelti: saldi iniziali + movimenti; filtri e cursore non lo cambiano;
#      conti di altri utenti ignorati; doppioni; conto_id e conti insieme 400;
#      elenchi illeggibili 400); GET /reports/riepilogo?conti= (saldo_scelti,
#      mese dei conti scelti; saldo_totale e conti invariati).
#   B. build, nginx con la CSP del progetto, browser: carte della fascia che si
#      sommano, pulsante «Conti» da computer, pannello dei filtri al telefono,
#      indirizzi con piu' conti, nessuna violazione della CSP.
#
#   API=http://127.0.0.1:33470/api DB_CONTAINER=pn-u7-db ./scripts/smoke/u7b-conti.sh
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
T="$(mktemp -d)"; NGX="u7bweb-$SFX"
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
conto() { q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id, attivo) VALUES ('$1', 'X', $2, $3, ${4:-true}) RETURNING id"; }
mv() { q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ($1, $2, '$3', $4, '$5', $6) RETURNING id"; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}
# lista <query>: "giorno importo saldo" delle righe, separate da |
lista() { hit "${AU[@]}" "$API/movimenti?$1" >/dev/null; py "print('|'.join(m['descrizione']+':'+m['saldo_progressivo'] for m in d['movimenti']))"; }

echo "=== setup (suffisso $SFX) ==="
U="u7bu$SFX"; V="u7bv$SFX"; S="u7bs$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); ST=$(reg_c "$S" "Studio U7 $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$ST" ] || { echo "registrazioni non riuscite"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AS=(-H "Authorization: Bearer $ST")
UID_=$(uid "$U"); VID=$(uid "$V"); SID=$(q "SELECT id FROM commercialisti WHERE username='$S'")
# U: Banca 1000,00 + Cassa 50,50 + Vecchio (disattivato) 200,00 -> base 1250,50
C1=$(conto Banca 1000.00 "$UID_"); C2=$(conto Cassa 50.50 "$UID_"); C3=$(conto Vecchio 200.00 "$UID_" false)
# V: un conto con un movimento, non deve toccare U
CV=$(conto AltraBanca 9999.00 "$VID"); mv "CURRENT_DATE" "$CV" V1 5000 Entrata "$VID" >/dev/null
# Movimenti di U: mese scorso e questo mese (giorni relativi al database)
M1=$(mv "date_trunc('month', CURRENT_DATE)::date - 10" "$C1" A 100.00 Uscita "$UID_")
M2=$(mv "date_trunc('month', CURRENT_DATE)::date - 5" "$C3" B 20.00 Entrata "$UID_")
M3=$(mv "date_trunc('month', CURRENT_DATE)::date" "$C1" C 200.00 Entrata "$UID_")
M4=$(mv "date_trunc('month', CURRENT_DATE)::date" "$C2" D 30.25 Uscita "$UID_")
M5=$(mv "date_trunc('month', CURRENT_DATE)::date + 1" "$C1" E 10.00 Entrata "$UID_")
MESE=$(q "SELECT to_char(CURRENT_DATE, 'YYYY-MM')"); PRIMA=$(q "SELECT to_char(CURRENT_DATE - interval '1 month', 'YYYY-MM')")

echo
echo "=== A. API ==="
# Banca 1000,00 + Cassa 50,50 = 1050,50: A -100 = 950,50; C +200 = 1150,50; D -30,25 = 1120,25; E +10 = 1130,25
eq "due conti: righe e saldo dei soli due" "E:1130.25|D:1120.25|C:1150.50|A:950.50" "$(lista "limit=10&conti=$C1,$C2")"
eq "due conti in ordine inverso: uguale" "E:1130.25|D:1120.25|C:1150.50|A:950.50" "$(lista "limit=10&conti=$C2,$C1")"
# Cassa 50,50 + Vecchio (disattivato) 200,00 = 250,50: B +20 = 270,50; D -30,25 = 240,25
eq "con un conto disattivato" "D:240.25|B:270.50" "$(lista "limit=10&conti=$C2,$C3")"
eq "un conto in conti = conto_id" "$(lista "limit=10&conto_id=$C1")" "$(lista "limit=10&conti=$C1")"
eq "doppioni ignorati" "$(lista "limit=10&conto_id=$C1")" "$(lista "limit=10&conti=$C1,$C1,$C1")"
eq "tutti e tre = nessuna scelta" "$(lista "limit=10")" "$(lista "limit=10&conti=$C1,$C2,$C3")"
eq "filtro tipo: il saldo resta quello dei due conti" "E:1130.25|C:1150.50" "$(lista "limit=10&tipo=Entrata&conti=$C1,$C2")"
eq "ricerca: il saldo resta quello dei due conti" "D:1120.25" "$(lista "limit=10&search=D&conti=$C1,$C2")"
eq "cursore: la seconda pagina continua il saldo" "D:1120.25|C:1150.50" \
  "$(hit "${AU[@]}" "$API/movimenti?limit=1&conti=$C1,$C2" >/dev/null; CUR=$(py "print(d['pagination']['cursore'])"); lista "limit=2&conti=$C1,$C2&dopo=$CUR")"
eq "totali dei due conti" "4|210.00|130.25" \
  "$(hit "${AU[@]}" "$API/movimenti?conti=$C1,$C2" >/dev/null; py "t=d['totali'];print(t['numero_movimenti'],t['totale_entrate'],t['totale_uscite'],sep='|')")"
eq "conto di un altro utente nella scelta: ignorato, saldo invariato" "$(lista "limit=10&conti=$C1")" "$(lista "limit=10&conti=$C1,$CV")"
eq "solo conti di un altro utente: nessuna riga" "200|0" "$(hit "${AU[@]}" "$API/movimenti?conti=$CV")|$(py "print(len(d['movimenti']))")"
eq "V chiede i conti di U: nessuna riga" "200|0" "$(hit "${AV[@]}" "$API/movimenti?conti=$C1,$C2")|$(py "print(len(d['movimenti']))")"
eq "conto_id e conti insieme: 400" "400" "$(hit "${AU[@]}" "$API/movimenti?conto_id=$C1&conti=$C2")"
for X in "" "0" "1,,2" "abc" "1,-2" "99999999999" "2147483648" "$(python3 -c "print(','.join(str(i) for i in range(1,52)))")"; do
  eq "conti=\"${X:0:20}\": 400" "400" "$(hit "${AU[@]}" "$API/movimenti?conti=$X")"
done
eq "50 conti: accettati" "200" "$(hit "${AU[@]}" "$API/movimenti?conti=$(python3 -c "print(','.join(str(i) for i in range(1,51)))")")"

eq "riepilogo con due conti: 200" "200" "$(hit "${AU[@]}" "$API/reports/riepilogo?conti=$C1,$C2")"
eq "riepilogo: saldo_scelti = primo saldo progressivo, totale invariato" "1130.25|1350.25|3" \
  "$(py "print(d['saldo_scelti'],d['saldo_totale'],len(d['conti']),sep='|')")"
eq "riepilogo: mese dei due conti" "$MESE|3|210.00|30.25" "$(py "m=d['mese'];print(m['mese'],m['numero'],m['entrate'],m['uscite'],sep='|')")"
eq "riepilogo: mese prima dei due conti" "$PRIMA|1|0.00|100.00" "$(py "m=d['mese_precedente'];print(m['mese'],m['numero'],m['entrate'],m['uscite'],sep='|')")"
eq "riepilogo senza conti: niente saldo_scelti, mese di tutti" "False|2" \
  "$(hit "${AU[@]}" "$API/reports/riepilogo" >/dev/null; py "print('saldo_scelti' in d, d['mese_precedente']['numero'], sep='|')")"
eq "riepilogo con il conto di V: 0, nessun movimento" "0.00|1350.25|0" \
  "$(hit "${AU[@]}" "$API/reports/riepilogo?conti=$CV" >/dev/null; py "print(d['saldo_scelti'],d['saldo_totale'],d['mese']['numero'],sep='|')")"
eq "riepilogo di V coi conti di U: 0" "0.00|0" \
  "$(hit "${AV[@]}" "$API/reports/riepilogo?conti=$C1,$C2" >/dev/null; py "print(d['saldo_scelti'],d['mese_precedente']['numero'],sep='|')")"
eq "riepilogo con conti illeggibili: 400" "400" "$(hit "${AU[@]}" "$API/reports/riepilogo?conti=1,,2")"

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
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" C1="$C1" C2="$C2" \
  browser node "$R/scripts/smoke/lib/u7b-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
