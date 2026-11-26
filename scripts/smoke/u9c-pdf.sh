#!/usr/bin/env bash
# Smoke test del blocco U9c: estratti conto in PDF (pdftotext).
#
#   lettore (node scripts/smoke/lib/u9a-lettore.js); anteprima senza scrivere;
#   conferma: righe abbinate a movimenti gia' nel Registro (+-3 giorni, stesso
#   tipo e importo), le altre movimenti «da descrivere»; stesso file di nuovo:
#   nessun doppione; controllo del saldo dichiarato nel file; filtro
#   da_descrivere e modifica che lo spegne; colonne non riconosciute -> 422 con
#   le righe, mappa del cliente -> modello salvato e riconosciuto per un altro
#   utente; isolamento (conto e estratto altrui 404, token dello studio 401);
#   file e mappe ostili.
#
#   API=http://127.0.0.1:33530/api DB_CONTAINER=pn-u9x-db ./scripts/smoke/u9a-estratti.sh
set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T="$(mktemp -d)"; NGX="u9cweb-$SFX"
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

DATI="$T/pdf"; node "$R/scripts/smoke/lib/u9c-pdf-dati.js" "$DATI" >/dev/null
echo "=== lettore dei PDF ==="
node "$R/scripts/smoke/lib/u9c-lettore.js" "$DATI" > "$T/l.log" 2>&1; rc=$?
grep -E '^  (OK|FAIL)' "$T/l.log" | grep FAIL -A2
eq "lettore: exit 0 ($(tail -1 "$T/l.log"))" "0" "$rc"

echo "=== setup (suffisso $SFX) ==="
U="u9cu$SFX"; V="u9cv$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V")
[ -n "$UT" ] && [ -n "$VT" ] || { echo "registrazioni non riuscite"; exit 1; }
UID_=$(uid "$U"); VID=$(uid "$V")
CF=$(conto Fineco -1250.40 "$UID_"); CB=$(conto "Banco BPM" 0 "$UID_")
nmov() { q "SELECT count(*) FROM movimenti WHERE user_id=$UID_"; }

echo "=== Fineco, estratto trimestrale in PDF ==="
eq "anteprima: 200, formato pdf, 5 nuove, periodo" "200|pdf|5|0|2026-01-02|2026-03-31" \
  "$(carica "$API/estratti/anteprima" "$UT" "$CF" "$DATI/fineco.pdf")|$(py "r=d['riepilogo'];print(d['formato'],r['nuove'],r['abbinate'],d['dal'],d['al'],sep='|')")"
eq "saldo: file 189.40, Registro dopo 189.40, torna" "189.40|189.40|0.00" "$(py "s=d['riepilogo']['saldo'];print(s['file'],s['registro_dopo'],s['differenza'],sep='|')")"
eq "anteprima non scrive" "0" "$(nmov)"
eq "import: 201" "201" "$(carica "$API/estratti" "$UT" "$CF" "$DATI/fineco.pdf")"
eq "estratto registrato come pdf, 5 righe, 5 da descrivere col testo della banca" "pdf|5|5|1" \
  "$(q "SELECT e.formato||'|'||e.righe||'|'||(SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND da_descrivere)||'|'||(SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND descrizione='Addebito SDD Enel Energia bolletta dicembre') FROM estratti_conto e WHERE e.user_id=$UID_")"
eq "due caffe' uguali restano due" "2" "$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND descrizione='Pagamento POS bar Centrale'")"
eq "stesso PDF di nuovo: 5 gia' importate, nessun movimento in piu'" "5|5" \
  "$(carica "$API/estratti/anteprima" "$UT" "$CF" "$DATI/fineco.pdf" >/dev/null; py "print(d['riepilogo']['gia'])")|$(nmov)"

echo "=== Banco BPM, lista movimenti in PDF ==="
eq "anteprima: 5 nuove, saldo contabile letto" "200|5|2345.67" \
  "$(carica "$API/estratti/anteprima" "$UT" "$CB" "$DATI/bpm.pdf")|$(py "print(d['riepilogo']['nuove'],d['riepilogo']['saldo']['file'],sep='|')")"
eq "entrata e uscite giuste" "Entrata:1800.00,Uscita:1000.00" \
  "$(py "print(','.join(f\"{r['tipo']}:{r['importo']}\" for r in d['righe'] if r['importo'] in ('1800.00','1000.00')))")"

echo "=== rifiuti e isolamento ==="
eq "scansione: 422 spiegato" "422|True" "$(carica "$API/estratti/anteprima" "$UT" "$CF" "$DATI/scansione.pdf")|$(py "print('scansione' in d['error'])")"
{ printf '%%PDF-1.4\n'; head -c 3000 /dev/urandom; } > "$T/rotto.pdf"
eq "PDF rovinato: 422" "422" "$(carica "$API/estratti/anteprima" "$UT" "$CF" "$T/rotto.pdf")"
N0=$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")
eq "PDF di 61 pagine (tetto 60): 422, nessun movimento" "422|True|$N0" "$(carica "$API/estratti/anteprima" "$UT" "$CF" "$DATI/lungo.pdf")|$(py "print('60 pagine' in d['error'])")|$(carica "$API/estratti" "$UT" "$CF" "$DATI/lungo.pdf" >/dev/null; q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")"
eq "V sul conto di U con un PDF: 404" "404" "$(carica "$API/estratti/anteprima" "$VT" "$CF" "$DATI/fineco.pdf")"
eq "nessun movimento creato dai rifiuti" "5" "$(nmov)"

echo "=== browser (build, nginx con la CSP) ==="
W="u9cw$SFX"; WT=$(reg_u "$W"); WID=$(uid "$W"); conto Fineco -1250.40 "$WID" >/dev/null
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
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$WT" FILE="$DATI/fineco.pdf" browser node "$R/scripts/smoke/lib/u9c-browser.mjs"
eq "dal browser: 5 movimenti da descrivere" "5" "$(q "SELECT count(*) FROM movimenti WHERE user_id=$WID AND da_descrivere")"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
