#!/usr/bin/env bash
# Smoke test del blocco U9a (API): estratti conto della banca.
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
T="$(mktemp -d)"; NGX="u9aweb-$SFX"
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

echo "=== lettore ==="
node "$R/scripts/smoke/lib/u9a-lettore.js" > "$T/l.log" 2>&1; rc=$?
eq "lettore: exit 0 ($(tail -1 "$T/l.log"))" "0" "$rc"

echo "=== setup (suffisso $SFX) ==="
U="u9au$SFX"; V="u9av$SFX"; S="u9as$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); ST=$(reg_c "$S" "Studio U9a $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$ST" ] || { echo "registrazioni non riuscite"; exit 1; }
UID_=$(uid "$U"); VID=$(uid "$V")
CU=$(conto Fineco 0.50 "$UID_"); CV=$(conto Fineco 0 "$VID")
# Gia' nel Registro: la bolletta Enel scritta un giorno prima della banca (si
# abbina) e un'uscita uguale ma 13 giorni prima (fuori tolleranza: non si abbina).
ME=$(q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ('2026-10-24', $CU, 'Bolletta Enel', 45.30, 'Uscita', $UID_) RETURNING id")
q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ('2026-10-12', $CU, 'Altra', 45.30, 'Uscita', $UID_) RETURNING id" >/dev/null
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT")
nmov() { q "SELECT count(*) FROM movimenti WHERE user_id=$UID_"; }

echo "=== anteprima ==="
eq "anteprima: 200" "200" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$FX")"
eq "4 righe: 1 abbinata (Enel, un giorno prima), 3 nuove, 0 gia'" "4|1|3|0" "$(py "r=d['riepilogo'];print(r['totale'],r['abbinate'],r['nuove'],r['gia'],sep='|')")"
eq "abbinata al movimento giusto" "$ME|2026-10-24" "$(py "x=[r for r in d['righe'] if r['esito']=='abbinata'][0];print(x['movimento_id'],x['giorno_registro'],sep='|')")"
eq "periodo e riga «Autorizzato» scartata" "2026-10-02|2026-10-30|1" "$(py "print(d['dal'],d['al'],d['scartate'],sep='|')")"
eq "saldo: file 1019.25, Registro dopo 973.95, differenza 45.30 (l'uscita del 12/10)" "1019.25|973.95|45.30" \
  "$(py "s=d['riepilogo']['saldo'];print(s['file'],s['registro_dopo'],s['differenza'],sep='|')")"
eq "anteprima non scrive nulla" "2|0|0" "$(nmov)|$(q "SELECT count(*) FROM estratti_conto WHERE user_id=$UID_")|$(q "SELECT count(*) FROM righe_estratto WHERE user_id=$UID_")"

echo "=== conferma ==="
eq "import: 201" "201" "$(carica "$API/estratti" "$UT" "$CU" "$FX")"
EID=$(py "print(d['id'])")
eq "3 movimenti nuovi, tutti da descrivere, col testo della banca" "5|3|1" \
  "$(nmov)|$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND da_descrivere")|$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND da_descrivere AND descrizione LIKE 'Rata 7 di 48%' AND importo=435.45 AND tipo='Uscita' AND data='2026-10-05'")"
eq "4 righe della banca: 1 abbinata a Enel, 3 create" "1|3|$ME" \
  "$(q "SELECT count(*) FILTER (WHERE esito='abbinata')||'|'||count(*) FILTER (WHERE esito='creata')||'|'||max(movimento_id) FILTER (WHERE esito='abbinata') FROM righe_estratto WHERE estratto_id=$EID")"
eq "Enel abbinata non diventa «da descrivere»" "f" "$(q "SELECT da_descrivere FROM movimenti WHERE id=$ME")"

echo "=== stesso file di nuovo ==="
eq "anteprima: 4 gia' importate, 0 nuove" "200|4|0" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$FX")|$(py "r=d['riepilogo'];print(r['gia'],r['nuove'],sep='|')")"
eq "import di nuovo: 409, nessun movimento ne' estratto in piu'" "409|5|1" "$(carica "$API/estratti" "$UT" "$CU" "$FX")|$(nmov)|$(q "SELECT count(*) FROM estratti_conto WHERE user_id=$UID_")"
eq "saldo ora: Registro 973.95 contro file 1019.25" "45.30" "$(py "print(d['riepilogo']['saldo']['differenza'])")"

echo "=== da descrivere ==="
eq "GET /movimenti?da_descrivere=true: 3" "200|3" "$(hit "${AU[@]}" "$API/movimenti?da_descrivere=true")|$(py "print(len(d['movimenti']))")"
MD=$(py "print(d['movimenti'][0]['id'])")
eq "campo da_descrivere nella riga" "True" "$(py "print(d['movimenti'][0]['da_descrivere'])")"
eq "descritto (categoria e nota): 200" "200" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/movimenti/$MD" -d '{"categoria":"Finanziamenti","note":"rata auto"}')"
eq "ora 2 da descrivere" "2" "$(hit "${AU[@]}" "$API/movimenti?da_descrivere=true" >/dev/null; py "print(len(d['movimenti']))")"
eq "elenco estratti: 1, con 2 da descrivere" "200|1|2" \
  "$(hit "${AU[@]}" "$API/estratti?conto_id=$CU")|$(py "print(len(d),[e for e in d if e['id']==$EID][0]['da_descrivere'],sep='|')")"
eq "dettaglio: 4 righe della banca" "200|4" "$(hit "${AU[@]}" "$API/estratti/$EID")|$(py "print(len(d['righe_banca']))")"

echo "=== colonne non riconosciute, modello ==="
printf "Giorno;Cifra;Testo $SFX\r\n01/11/2026;-12,50;FARMACIA\r\n02/11/2026;300,00;RIMBORSO\r\n" > "$T/strano.csv"
eq "422 con serve_mappa e le righe del file" "422|True|Giorno" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/strano.csv")|$(py "print(d.get('serve_mappa'),d['righe'][0][0],sep='|')")"
MAPPA='{"data":0,"importo":1,"descrizione":2,"intestazione":0}'
eq "con la mappa: 2 nuove" "200|2" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/strano.csv" "$MAPPA")|$(py "print(d['riepilogo']['nuove'])")"
eq "anteprima non salva il modello" "0" "$(q "SELECT count(*) FROM modelli_estratto WHERE creato_da=$UID_")"
eq "import con la mappa: 201, modello salvato col nome della banca, senza dati" "201|1|Fineco|false" \
  "$(carica "$API/estratti" "$UT" "$CU" "$T/strano.csv" "$MAPPA")|$(q "SELECT count(*)||'|'||max(nome)||'|'||bool_or(mappa::text LIKE '%FARMACIA%') FROM modelli_estratto WHERE creato_da=$UID_")"
eq "un altro utente, stesso tipo di file, senza mappa: riconosciuto" "200|Fineco|2" \
  "$(carica "$API/estratti/anteprima" "$VT" "$CV" "$T/strano.csv")|$(py "print(d['modello']['nome'],d['riepilogo']['nuove'],sep='|')")"
eq "mappa con colonna inesistente: 422" "422" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/strano.csv" '{"data":0,"importo":9,"descrizione":2,"intestazione":0}')"
eq "mappa non JSON: 400" "400" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/strano.csv" 'nonjson')"

echo "=== isolamento e file ostili ==="
eq "V sul conto di U: 404" "404" "$(carica "$API/estratti/anteprima" "$VT" "$CU" "$FX")"
eq "V sull'estratto di U: 404" "404" "$(hit "${AV[@]}" "$API/estratti/$EID")"
eq "V non vede gli estratti di U" "0" "$(hit "${AV[@]}" "$API/estratti" >/dev/null; py "print(len(d))")"
eq "token dello studio: 401" "401" "$(carica "$API/estratti/anteprima" "$ST" "$CU" "$FX")"
eq "senza token: 401" "401" "$(hit -X POST -F "file=@$FX" --form-string "conto_id=$CU" "$API/estratti/anteprima")"
eq "senza file: 400" "400" "$(hit -X POST "${AU[@]}" --form-string "conto_id=$CU" "$API/estratti/anteprima")"
eq "conto non numerico: 400" "400" "$(carica "$API/estratti/anteprima" "$UT" "abc" "$FX")"
printf '\xd0\xcf\x11\xe0vecchio' > "$T/v.xls"
eq "vecchio .xls: 422 con spiegazione" "422|True" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/v.xls")|$(py "print('xlsx' in d['error'])")"
head -c 11000000 /dev/zero > "$T/grande.csv"
eq "oltre 10 MB: 413" "413" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/grande.csv")"
printf '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><Document><BkToCstmrStmt/></Document>' > "$T/x.xml"
eq "XML con entita': 422" "422" "$(carica "$API/estratti/anteprima" "$UT" "$CU" "$T/x.xml")"
eq "nessun movimento creato dai rifiuti" "7" "$(nmov)"

echo "=== browser (build, nginx con la CSP) ==="
W="u9aw$SFX"; WT=$(reg_u "$W"); WID=$(uid "$W"); CW=$(conto Fineco 0.50 "$WID")
q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ('2026-10-24', $CW, 'Bolletta Enel', 45.30, 'Uscita', $WID) RETURNING id" >/dev/null
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
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$WT" FILE="$FX" browser node "$R/scripts/smoke/lib/u9a-browser.mjs"
PRIMO=$(awk '/^PRIMO/{print $2}' "$T/b.log")
eq "dal browser: descritto con nota e categoria nuova, non piu' da descrivere; 2 restano" "spiegato al browser|Prova U9a|false|2" \
  "$(q "SELECT note||'|'||categoria||'|'||da_descrivere FROM movimenti WHERE id=${PRIMO:-0} AND user_id=$WID")|$(q "SELECT count(*) FROM movimenti WHERE user_id=$WID AND da_descrivere")"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
