#!/usr/bin/env bash
# Smoke test del blocco U6c (fase UX): portale dello studio.
#
#   A. API: «Da fare» (da rivedere, in attesa, messaggi non letti) di tutti i
#      clienti attivi, movimento citato solo dentro l'ambito, isolamento fra
#      studi, accesso registrato; riepilogo del cliente (mese dentro l'ambito,
#      importi come testo); orari letti come UTC con il backend fuori da UTC;
#
#   API=http://127.0.0.1:33360/api DB_CONTAINER=pn-u6-db ./scripts/smoke/u6c-studio.sh
#
# Da far girare con il backend su TZ=America/Los_Angeles. Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"
trap 'rm -rf "${T:?}"' EXIT

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
# richiesta <token studio> <username cliente> <token cliente>: id del collegamento in attesa
richiesta() {
  curl -s -X POST "$API/commercialisti/richieste" -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$2\"}" >/dev/null
  curl -s "$API/utenti/collegamenti" -H "Authorization: Bearer $3" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['collegamenti'] if c['stato']=='in_attesa'][0])" 2>/dev/null; }
uid() { q "SELECT id FROM utenti WHERE username='$1'"; }
conto() { q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('$1', 'X', 0, $2) RETURNING id"; }
mv() { q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES ('$1', $2, '$3', $4, '$5', $6) RETURNING id"; }
# msg <token> <query> <corpo json>: id del messaggio
msg() { curl -s -X POST "$API/messaggi?$2" -H "Authorization: Bearer $1" "${JSON[@]}" -d "$3" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('messaggio') or d.get('data') or {}).get('id','-'))" 2>/dev/null; }
dafare() { hit -H "Authorization: Bearer $1" "$API/commercialisti/da-fare"; }

echo "=== setup (suffisso $SFX) ==="
S="u6cs$SFX"; S2="u6ct$SFX"; U="u6cu$SFX"; W="u6cw$SFX"; X="u6cx$SFX"
ST=$(reg_c "$S" "Studio $S"); S2T=$(reg_c "$S2" "Studio $S2")
UT=$(reg_u "$U"); WT=$(reg_u "$W"); XT=$(reg_u "$X")
UID_=$(uid "$U"); WID=$(uid "$W"); XID=$(uid "$X")
AS=(-H "Authorization: Bearer $ST"); AS2=(-H "Authorization: Bearer $S2T"); AU=(-H "Authorization: Bearer $UT")
CA=$(conto "Banca A $SFX" "$UID_"); CB=$(conto "Banca B $SFX" "$UID_"); CX=$(conto "Banca X $SFX" "$XID")
M1=$(mv 2026-03-05 "$CA" 'Fattura marzo' 100.50 Entrata "$UID_")
M2=$(mv 2026-03-10 "$CA" 'Bar' 20.25 Uscita "$UID_")
mv 2026-03-11 "$CB" 'Fuori conto' 999 Uscita "$UID_" >/dev/null
mv 2025-12-31 "$CA" 'Fuori periodo' 50 Uscita "$UID_" >/dev/null
mv 2026-04-01 "$CA" 'Aprile' 7 Entrata "$UID_" >/dev/null
mv 2026-03-05 "$CX" 'Di X' 5000 Entrata "$XID" >/dev/null
CU=$(richiesta "$ST" "$U" "$UT")
curl -s -X PUT "$API/utenti/collegamenti/$CU/accetta" "${AU[@]}" "${JSON[@]}" -d "{\"ambito_dal\":\"2026-01-01\",\"conti_ammessi\":[$CA]}" >/dev/null
CW=$(richiesta "$ST" "$W" "$WT")                              # resta in attesa
CX_=$(richiesta "$S2T" "$X" "$XT")
curl -s -X PUT "$API/utenti/collegamenti/$CX_/accetta" -H "Authorization: Bearer $XT" "${JSON[@]}" -d '{}' >/dev/null
eq "collegamenti: U attivo, W in attesa, X attivo con l'altro studio" "attiva|in_attesa|attiva" \
  "$(q "SELECT string_agg(stato, '|' ORDER BY array_position(ARRAY[$CU,$CW,$CX_], id)) FROM collegamenti_commercialista WHERE id IN ($CU,$CW,$CX_)")"
QS="userId=$UID_"; QU="collegamentoId=$CU"

echo
echo "=== A. Da fare ==="
eq "da fare vuoto: 200, niente" "200|0|0|0" "$(dafare "$ST")|$(py "print(len(d['rivedere']),len(d['attesa']),len(d['messaggi']),sep='|')")"
C1=$(msg "$ST" "$QS" "{\"messaggio\":\"Cos'e' questa fattura?\",\"movimento_id\":$M1,\"chiarimento\":true}")
C2=$(msg "$ST" "$QS" '{"messaggio":"Mancano i documenti di febbraio","chiarimento":true}')
sleep 1
R2=$(msg "$UT" "$QU" '{"messaggio":"Li carico domani"}')   # risponde ai documenti, non alla fattura
C3=$(msg "$UT" "$QU" "{\"messaggio\":\"Il bar va fra le spese?\",\"movimento_id\":$M2,\"chiarimento\":true}")
C4=$(msg "$ST" "$QS" "{\"messaggio\":\"E questo bar?\",\"movimento_id\":$M2,\"chiarimento\":true}")
msg "$S2T" "userId=$XID" '{"messaggio":"Per X","chiarimento":true}' >/dev/null
msg "$XT" "collegamentoId=$CX_" '{"messaggio":"X scrive"}' >/dev/null
eq "messaggi creati" "True" "$(python3 -c "print(all(x.isdigit() for x in '$C1 $C2 $R2 $C3 $C4'.split()))")"
eq "da fare: 200" "200" "$(dafare "$ST")"
eq "in attesa: la fattura e il bar (il cliente non ha scritto dopo)" "$C4,$C1" "$(py "print(','.join(str(x['id']) for x in d['attesa']))")"
eq "da rivedere: domanda del cliente e documenti (ha risposto)" "$C3,$C2" "$(py "print(','.join(str(x['id']) for x in d['rivedere']))")"
eq "messaggi: un cliente, 2 non letti, l'ultimo" "1|$U|2|Il bar va fra le spese?" "$(py "m=d['messaggi'];print(len(m),m[0]['cliente'],m[0]['non_letti'],m[0]['ultimo'],sep='|')")"
eq "movimento citato dentro l'ambito: giorno, importo come testo" "2026-03-05|100.50|False" \
  "$(py "x=[r for r in d['attesa'] if r['id']==$C1][0];print(x['movimento']['giorno'],x['movimento']['importo'],x['movimento_nascosto'],sep='|')")"
eq "nessun dato dell'altro studio" "False" "$(py "print('$X' in json.dumps(d))" 2>/dev/null || python3 -c "import json;print('$X' in open('$T/body').read())")"
q "UPDATE movimenti SET conto_id=$CB WHERE id=$M1" >/dev/null
dafare "$ST" >/dev/null
eq "movimento spostato fuori ambito: nascosto, nessun contenuto" "None|True|False" \
  "$(py "x=[r for r in d['attesa'] if r['id']==$C1][0];print(x['movimento'],x['movimento_nascosto'],'Fattura marzo' in open('$T/body').read(),sep='|')")"
q "UPDATE movimenti SET conto_id=$CA WHERE id=$M1" >/dev/null
eq "altro studio: solo il suo cliente (X ha risposto)" "200|1|0|1" "$(dafare "$S2T")|$(py "print(len(d['rivedere']),len(d['attesa']),len(d['messaggi']),sep='|')")"
eq "token del cliente: 401" "401" "$(dafare "$UT")"
eq "accesso registrato: chat del cliente U" "1" "$(q "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$CU AND tipo_accesso='chat'")"
curl -s -X PUT "$API/messaggi/$C2/chiarimento?$QS" "${AS[@]}" "${JSON[@]}" -d '{"stato":"risolta"}' >/dev/null
dafare "$ST" >/dev/null
eq "risolto: esce da «da rivedere»" "$C3" "$(py "print(','.join(str(x['id']) for x in d['rivedere']))")"
curl -s -X PUT "$API/utenti/collegamenti/$CU/sospendi" "${AU[@]}" "${JSON[@]}" -d '{"motivo":"pausa"}' >/dev/null
eq "collegamento sospeso: niente da fare" "200|0|0|0" "$(dafare "$ST")|$(py "print(len(d['rivedere']),len(d['attesa']),len(d['messaggi']),sep='|')")"
curl -s -X PUT "$API/utenti/collegamenti/$CU/riattiva" "${AU[@]}" >/dev/null

echo
echo "=== B. riepilogo del cliente ==="
RIEP="$API/commercialisti/clienti/$UID_/riepilogo"
eq "riepilogo di marzo: 200" "200" "$(hit "${AS[@]}" "$RIEP?mese=2026-03")"
eq "marzo dentro l'ambito: entrate, uscite, movimenti (fuori conto escluso)" "2026-03|100.50|20.25|2" \
  "$(py "r=d['riepilogo'];print(r['mese'],r['entrate'],r['uscite'],r['movimenti'],sep='|')")"
eq "chiarimenti aperti e non letti" "3|2" "$(py "r=d['riepilogo'];print(r['chiarimenti_aperti'],r['non_letti'],sep='|')")"
eq "ambito nella risposta, come giorni" "2026-01-01|None|[$CA]" "$(py "r=d['riepilogo'];print(r['ambito_dal'],r['ambito_al'],json.dumps(r['conti_ammessi']).replace(' ',''),sep='|')" 2>/dev/null || py "import json;r=d['riepilogo'];print(r['ambito_dal'],r['ambito_al'],json.dumps(r['conti_ammessi']).replace(' ',''),sep='|')")"
eq "dicembre 2025, prima dell'ambito: zero" "0|0|0" "$(hit "${AS[@]}" "$RIEP?mese=2025-12" >/dev/null; py "r=d['riepilogo'];print(r['entrate'],r['uscite'],r['movimenti'],sep='|')")"
eq "aprile: 7,00 di entrata" "7.00|0|1" "$(hit "${AS[@]}" "$RIEP?mese=2026-04" >/dev/null; py "r=d['riepilogo'];print(r['entrate'],r['uscite'],r['movimenti'],sep='|')")"
eq "senza mese: il mese corrente" "200|True" "$(hit "${AS[@]}" "$RIEP")|$(py "import datetime;print(d['riepilogo']['mese']==datetime.datetime.utcnow().strftime('%Y-%m'))")"
eq "mese non valido: 400" "400|400|400" "$(hit "${AS[@]}" "$RIEP?mese=2026-13")|$(hit "${AS[@]}" "$RIEP?mese=0000-01")|$(hit "${AS[@]}" "$RIEP?mese=marzo")"
eq "cliente in attesa: 403" "403" "$(hit "${AS[@]}" "$API/commercialisti/clienti/$WID/riepilogo")"
eq "cliente dell'altro studio: 403" "403" "$(hit "${AS[@]}" "$API/commercialisti/clienti/$XID/riepilogo")"
eq "token del cliente: 401" "401" "$(hit "${AU[@]}" "$RIEP")"
eq "id non numerico: 400" "400" "$(hit "${AS[@]}" "$API/commercialisti/clienti/abc/riepilogo")"
eq "riepilogo registrato come dettaglio del cliente" "True" \
  "$(q "SELECT count(*) >= 4 FROM accessi_commercialista WHERE collegamento_id=$CU AND tipo_accesso='dettaglio_cliente' AND dettagli ? 'riepilogo'" | sed 's/t/True/;s/f/False/')"

echo
echo "=== C. orari con il backend fuori da UTC ==="
hit "${AS[@]}" "$API/messaggi?$QS&limit=50" >/dev/null
eq "ora del messaggio uguale a quella del database (UTC)" \
  "$(q "SELECT to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS') FROM messaggi_commercialista WHERE id=$C1")" \
  "$(py "print([m for m in d['messaggi'] if m['id']==$C1][0]['created_at'][:19])")"
eq "messaggio appena scritto: ora di adesso (scarto < 5 minuti)" "True" \
  "$(py "import datetime as t;x=[m for m in d['messaggi'] if m['id']==$C4][0]['created_at'];print(abs((t.datetime.fromisoformat(x.replace('Z','+00:00'))-t.datetime.now(t.timezone.utc)).total_seconds())<300)")"
hit "${AU[@]}" "$API/utenti/collegamenti" >/dev/null
eq "richiesta di collegamento: giorno e ora del database" \
  "$(q "SELECT to_char(data_richiesta, 'YYYY-MM-DD\"T\"HH24:MI') FROM collegamenti_commercialista WHERE id=$CU")" \
  "$(py "print([c for c in d['collegamenti'] if c['id']==$CU][0]['data_richiesta'][:16])")"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
