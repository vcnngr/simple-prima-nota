#!/usr/bin/env bash
# Smoke test del blocco U7 (fase UX): il Registro come pagina iniziale.
#
#   A. API: saldo progressivo di tutti i conti in GET /movimenti senza conto
#      (saldi iniziali di tutti i conti, anche disattivati; filtri e cursore non
#      lo cambiano; per conto come prima; isolamento fra utenti);
#      GET /reports/riepilogo (saldo totale, conti, mese e mese prima, richieste
#      di chiarimento aperte solo su collegamento attivo; 401 senza utente).
#   B. build, nginx con la CSP del progetto, browser: tabella da 1366 px, lista
#      a 390 px, fascia, carte dei conti, /movimenti portato al Registro coi
#      filtri, dimensione del testo, nessuna violazione della CSP.
#
#   API=http://127.0.0.1:33470/api DB_CONTAINER=pn-u7-db ./scripts/smoke/u7-registro.sh
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
T="$(mktemp -d)"; NGX="u7web-$SFX"
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
U="u7u$SFX"; V="u7v$SFX"; S="u7s$SFX"
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
# base 1250,50: A -100 = 1150,50; B +20 = 1170,50; C +200 = 1370,50; D -30,25 = 1340,25; E +10 = 1350,25
eq "senza conto: saldo di tutti i conti, dal piu' recente" "E:1350.25|D:1340.25|C:1370.50|B:1170.50|A:1150.50" \
  "$(lista "limit=10")"
eq "cursore: la seconda pagina continua il saldo" "D:1340.25|C:1370.50" \
  "$(hit "${AU[@]}" "$API/movimenti?limit=1" >/dev/null; CUR=$(py "print(d['pagination']['cursore'])"); lista "limit=2&dopo=$CUR")"
eq "filtro tipo: il saldo resta quello vero" "E:1350.25|C:1370.50|B:1170.50" "$(lista "limit=10&tipo=Entrata")"
eq "ricerca: il saldo resta quello vero" "D:1340.25" "$(lista "limit=10&search=D")"
eq "con il conto: saldo di quel conto (come prima)" "E:1110.00|C:1100.00|A:900.00" "$(lista "limit=10&conto_id=$C1")"
eq "con il conto disattivato: saldo di quel conto" "B:220.00" "$(lista "limit=10&conto_id=$C3")"
eq "un altro utente: solo i suoi conti" "V1:14999.00" \
  "$(hit "${AV[@]}" "$API/movimenti?limit=10" >/dev/null; py "print('|'.join(m['descrizione']+':'+m['saldo_progressivo'] for m in d['movimenti']))")"
eq "conto di un altro utente: niente righe" "200|0" "$(hit "${AU[@]}" "$API/movimenti?conto_id=$CV")|$(py "print(len(d['movimenti']))")"

eq "riepilogo: 200" "200" "$(hit "${AU[@]}" "$API/reports/riepilogo")"
eq "riepilogo: saldo totale = ultimo saldo progressivo" "1350.25" "$(py "print(d['saldo_totale'])")"
eq "riepilogo: conti (attivi prima), saldi" "Banca:True:1110.00|Cassa:True:20.25|Vecchio:False:220.00" \
  "$(py "print('|'.join(f\"{c['nome_banca']}:{c['attivo']}:{c['saldo']}\" for c in d['conti']))")"
eq "riepilogo: mese corrente" "$MESE|3|210.00|30.25" "$(py "m=d['mese'];print(m['mese'],m['numero'],m['entrate'],m['uscite'],sep='|')")"
eq "riepilogo: mese prima" "$PRIMA|2|20.00|100.00" "$(py "m=d['mese_precedente'];print(m['mese'],m['numero'],m['entrate'],m['uscite'],sep='|')")"
eq "riepilogo: nessun chiarimento" "0" "$(py "print(d['da_chiarire'])")"
eq "riepilogo di V: solo il suo" "14999.00|1" "$(hit "${AV[@]}" "$API/reports/riepilogo" >/dev/null; py "print(d['saldo_totale'],len(d['conti']),sep='|')")"
# Chiarimenti: due aperti sullo stesso movimento contano uno; uno su un collegamento revocato no.
CL=$(q "INSERT INTO collegamenti_commercialista (commercialista_id, user_id, stato, data_richiesta, data_accettazione) VALUES ($SID, $UID_, 'attiva', now(), now()) RETURNING id")
for M in "$M3" "$M3" "$M4"; do q "INSERT INTO messaggi_commercialista (collegamento_id, mittente_tipo, mittente_id, messaggio, movimento_id, chiarimento_stato) VALUES ($CL, 'commercialista', $SID, 'Cos e''?', $M, 'aperta') RETURNING id" >/dev/null; done
q "INSERT INTO messaggi_commercialista (collegamento_id, mittente_tipo, mittente_id, messaggio, movimento_id, chiarimento_stato) VALUES ($CL, 'commercialista', $SID, 'Chiuso', $M5, 'risolta') RETURNING id" >/dev/null
eq "riepilogo: movimenti con chiarimento aperto (una volta sola)" "2" "$(hit "${AU[@]}" "$API/reports/riepilogo" >/dev/null; py "print(d['da_chiarire'])")"
eq "con il filtro da_chiarire: gli stessi due" "D|C" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=true" >/dev/null; py "print('|'.join(m['descrizione'] for m in d['movimenti']))")"
q "UPDATE collegamenti_commercialista SET stato='revocata', data_revoca=now(), revocato_da='user' WHERE id=$CL RETURNING id" >/dev/null
eq "collegamento revocato: i chiarimenti non contano" "0" "$(hit "${AU[@]}" "$API/reports/riepilogo" >/dev/null; py "print(d['da_chiarire'])")"
q "UPDATE collegamenti_commercialista SET stato='attiva', data_revoca=NULL, revocato_da=NULL WHERE id=$CL RETURNING id" >/dev/null
eq "riepilogo senza token: 401" "401" "$(hit "$API/reports/riepilogo")"
eq "riepilogo col token dello studio: rifiutato" "True" "$(c=$(hit "${AS[@]}" "$API/reports/riepilogo"); python3 -c "print($c in (401,403))")"
eq "utente senza conti: riepilogo vuoto" "0.00|0|0" \
  "$(W="u7w$SFX"; WT=$(reg_u "$W"); hit -H "Authorization: Bearer $WT" "$API/reports/riepilogo" >/dev/null; py "print(d['saldo_totale'],len(d['conti']),d['mese']['numero'],sep='|')")"

echo
echo "=== B. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
eq "pagina Estratto tolta, Registro al suo posto" "0|1" "$(ls "$D/src/pagine/Estratto.jsx" 2>/dev/null | wc -l | tr -d ' ')|$(ls "$D/src/pagine/Registro.jsx" | wc -l | tr -d ' ')"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" CONTO="$C1" \
  browser node "$R/scripts/smoke/lib/u7-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
