#!/usr/bin/env bash
# Smoke test del workflow di collegamento utente <-> commercialista (blocco W1).
#
# Verifica la macchina a stati della migration 002, il middleware
# requireCollegamento e l'applicazione dell'ambito accettato dal cliente.
#
# A differenza della prima stesura questo script ASSERISCE: ogni caso confronta
# l'esito con quello atteso, stampa OK o FAIL, e lo script esce 1 se anche un
# solo caso fallisce. Uno smoke che stampa e basta non e' una prova.
#
# Prerequisiti: backend in ascolto su $API, database raggiungibile via $DB_CONTAINER.
#
#   API=http://localhost:3009/api DB_CONTAINER=pn-w1-db ./scripts/smoke/w1-collegamento.sh
#
# Gli username portano un suffisso casuale: lo script si puo' rieseguire sullo
# stesso database senza ricrearlo.

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"

PASS=0; FAIL=0

psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s -o /tmp/w1body -w "%{http_code}" "$@"; }
body() { head -c 200 /tmp/w1body; }

ok()   { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko()   { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq()   { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }

# assert_http <descrizione> <atteso> <curl args...>
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"
  else ko "$desc" "HTTP $atteso" "HTTP $got — $(body)"; fi
}

AUTH_U=(-H "Content-Type: application/json")
echo "=== setup (suffisso $SFX) ==="
UT=$(curl -s -X POST $API/auth/register "${AUTH_U[@]}" -d "{\"username\":\"vittima$SFX\",\"email\":\"v$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
CT=$(curl -s -X POST $API/commercialisti/register "${AUTH_U[@]}" -d "{\"username\":\"comm1$SFX\",\"email\":\"c1$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio Uno\"}" | j "['token']")
C2=$(curl -s -X POST $API/commercialisti/register "${AUTH_U[@]}" -d "{\"username\":\"comm2$SFX\",\"email\":\"c2$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio Due\"}" | j "['token']")
CLI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT" | j "['id']")
[ -n "$UT" ] && [ -n "$CT" ] && [ -n "$C2" ] && [ -n "$CLI" ] || { echo "SETUP FALLITO"; exit 1; }

# Due conti: uno finira' nell'ambito, l'altro no.
curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"nome_banca":"Banca Ammessa","intestatario":"Vittima","saldo_iniziale":1000}' >/dev/null
curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"nome_banca":"Banca Negata","intestatario":"Vittima","saldo_iniziale":500}' >/dev/null
CONTO_OK=$(curl -s "$API/conti-bancari" -H "Authorization: Bearer $UT" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin) if c['nome_banca']=='Banca Ammessa'][0])")
CONTO_NO=$(curl -s "$API/conti-bancari" -H "Authorization: Bearer $UT" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin) if c['nome_banca']=='Banca Negata'][0])")

# Movimenti: dentro ambito, fuori per conto, fuori per data.
mov() { curl -s -X POST $API/movimenti -H "Authorization: Bearer $UT" "${AUTH_U[@]}" \
  -d "{\"data\":\"$1\",\"conto_id\":$2,\"descrizione\":\"$3\",\"importo\":$4,\"tipo\":\"Entrata\"}" >/dev/null; }
mov 2025-06-01 "$CONTO_OK" "DENTRO-AMBITO"   100
mov 2025-06-02 "$CONTO_NO" "FUORI-PER-CONTO" 200
mov 2024-06-01 "$CONTO_OK" "FUORI-PER-DATA"  300
echo "user_id=$CLI conto_ammesso=$CONTO_OK conto_negato=$CONTO_NO"

echo
echo "=== A. token di invito ==="
assert_http "token con 365 giorni rifiutato (max 30)" 400 \
  -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"giorni_validita":365}'

TOK=$(curl -s -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{}' | j "['token']")
# Dalla migration 003 la tabella non conserva il valore in chiaro: la riga si
# ritrova per hash, non per token.
GG=$(psql_q -c "SELECT (scadenza::date - CURRENT_DATE) FROM token_inviti WHERE token_hash = encode(sha256(convert_to('$TOK','UTF8')),'hex');")
eq "validita' di default 7 giorni" "7" "$GG"

assert_http "il token apre una richiesta, non un accesso" 200 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" "${AUTH_U[@]}" -d "{\"token\":\"$TOK\"}"
eq "stato del collegamento appena creato" "in_attesa" "$(cat /tmp/w1body | j "['stato']")"

assert_http "token gia' usato -> rifiutato" 400 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C2" "${AUTH_U[@]}" -d "{\"token\":\"$TOK\"}"

echo
echo "=== B. in attesa: nessun dato ==="
assert_http "dettaglio cliente"  403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
assert_http "disconnessione"     403 -X DELETE "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
assert_http "export"             403 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${AUTH_U[@]}" -d '{"export_type":"semplice","tutto_storico":true}'
assert_http "chat"               403 "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT"

echo
echo "=== C. commercialista estraneo ==="
assert_http "dettaglio"      403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $C2"
assert_http "disconnessione" 403 -X DELETE "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $C2"

echo
echo "=== D. accettazione con ambito ==="
COLL=$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $UT" | j "['collegamenti'][0]['id']")
eq "l'utente vede 1 richiesta in attesa" "1" "$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $UT" | j "['in_attesa']")"

assert_http "ambito con conto non posseduto -> 400" 400 \
  -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"conti_ammessi":[999999]}'
assert_http "ambito con date invertite -> 400" 400 \
  -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"ambito_dal":"2025-12-31","ambito_al":"2025-01-01"}'

assert_http "accettazione" 200 -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" \
  -d "{\"ambito_dal\":\"2025-01-01\",\"conti_ammessi\":[$CONTO_OK]}"
eq "stato dopo accettazione" "attiva" "$(cat /tmp/w1body | j "['collegamento']['stato']")"
assert_http "ora il dettaglio risponde" 200 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"

echo
echo "=== E. l'ambito filtra davvero (P0-1) ==="
curl -s "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT" -o /tmp/w1det
CONTI_VISTI=$(python3 -c "import json;d=json.load(open('/tmp/w1det'));print(','.join(str(c['id']) for c in d['conti']))")
eq "dettaglio: solo il conto ammesso" "$CONTO_OK" "$CONTI_VISTI"
DESC=$(python3 -c "import json;d=json.load(open('/tmp/w1det'));print(','.join(sorted(m['descrizione'] for m in d['movimenti'])))")
eq "dettaglio: solo i movimenti in ambito" "DENTRO-AMBITO" "$DESC"
SALDO=$(python3 -c "import json;d=json.load(open('/tmp/w1det'));print(d['conti'][0]['saldo_corrente'])")
eq "dettaglio: saldo calcolato sui soli movimenti in ambito" "1100.00" "$SALDO"

curl -s -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${AUTH_U[@]}" \
  -d '{"export_type":"semplice","tutto_storico":true,"formato":"json"}' -o /tmp/w1exp
EXP=$(python3 -c "import json;d=json.load(open('/tmp/w1exp'));print(','.join(sorted(r['descrizione'] for r in d['data'])))")
eq "export: solo i movimenti in ambito" "DENTRO-AMBITO" "$EXP"

assert_http "export su conto fuori ambito -> 403" 403 \
  -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${AUTH_U[@]}" \
  -d "{\"export_type\":\"semplice\",\"tutto_storico\":true,\"formato\":\"json\",\"conto_id\":$CONTO_NO}"

echo
echo "=== F. chat e conteggio non letti ==="
curl -s -X POST "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"messaggio":"primo"}'  >/dev/null
curl -s -X POST "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"messaggio":"secondo"}' >/dev/null
eq "unread-count del commercialista" "2" "$(curl -s $API/messaggi/unread-count -H "Authorization: Bearer $CT" | j "['unread_count']")"
DASH_UNREAD=$(curl -s $API/commercialisti/dashboard -H "Authorization: Bearer $CT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([c['unread_messages'] for c in d['clienti'] if c['user_id']==$CLI][0])")
eq "unread_messages in dashboard" "2" "$DASH_UNREAD"

echo
echo "=== G. sospensione (P0-2) ==="
assert_http "sospendi" 200 -X PUT "$API/utenti/collegamenti/$COLL/sospendi" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"motivo":"sistemo marzo"}'
assert_http "dettaglio durante la sospensione" 403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
assert_http "chat durante la sospensione"      403 "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT"

curl -s $API/commercialisti/dashboard -H "Authorization: Bearer $CT" -o /tmp/w1dash
python3 - "$CLI" <<'PY' > /tmp/w1dashres
import json,sys
cli=int(sys.argv[1]); d=json.load(open('/tmp/w1dash'))
r=[c for c in d['clienti'] if c['user_id']==cli]
if not r: print('assente'); raise SystemExit
c=r[0]
campi=['email','saldo_totale','numero_conti','numero_movimenti','ultimo_movimento']
print('vuoto' if all(c.get(k) is None for k in campi) else 'espone:'+','.join(k for k in campi if c.get(k) is not None))
PY
eq "dashboard non espone dati contabili da sospeso" "vuoto" "$(cat /tmp/w1dashres)"

DASH_UNREAD_SOSP=$(curl -s $API/commercialisti/dashboard -H "Authorization: Bearer $CT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([c['unread_messages'] for c in d['clienti'] if c['user_id']==$CLI][0])")
eq "non letti non contati durante la sospensione" "0" "$DASH_UNREAD_SOSP"

# Riaccettare un collegamento sospeso azzerava l'ambito e riapriva i conti esclusi:
# accettare si fa una volta sola, dallo stato in_attesa. La sospensione si toglie
# con /riattiva, che non rimette in discussione il consenso gia' dato.
ACC_PRIMA=$(psql_q -c "SELECT data_accettazione FROM collegamenti_commercialista WHERE id=$COLL;")
assert_http "accettare un sospeso -> 409" 409 \
  -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{}'
eq "l'ambito sopravvive al tentativo" "{$CONTO_OK}" \
  "$(psql_q -c "SELECT conti_ammessi FROM collegamenti_commercialista WHERE id=$COLL;")"

assert_http "riattiva" 200 -X PUT "$API/utenti/collegamenti/$COLL/riattiva" -H "Authorization: Bearer $UT"
eq "riattiva preserva i conti dell'ambito" "{$CONTO_OK}" \
  "$(psql_q -c "SELECT conti_ammessi FROM collegamenti_commercialista WHERE id=$COLL;")"
eq "riattiva preserva la data di accettazione" "$ACC_PRIMA" \
  "$(psql_q -c "SELECT data_accettazione FROM collegamenti_commercialista WHERE id=$COLL;")"
assert_http "dettaglio dopo riattivazione" 200 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
curl -s "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT" -o /tmp/w1det2
eq "dopo la riattivazione l'ambito filtra ancora" "$CONTO_OK" \
  "$(python3 -c "import json;d=json.load(open('/tmp/w1det2'));print(','.join(str(c['id']) for c in d['conti']))")"

echo
echo "=== H. revoca e stati terminali ==="
assert_http "revoca" 200 -X DELETE "$API/utenti/collegamenti/$COLL" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{"motivo":"cambio studio"}'
assert_http "dettaglio dopo revoca" 403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
assert_http "accettare un revocato -> 409" 409 -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{}'
assert_http "riattivare un revocato -> 409" 409 -X PUT "$API/utenti/collegamenti/$COLL/riattiva" -H "Authorization: Bearer $UT"

echo
echo "=== I. un token nuovo non riapre lo stato terminale (P0-3) ==="
TOK2=$(curl -s -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${AUTH_U[@]}" -d '{}' | j "['token']")
assert_http "secondo token usato dallo stesso commercialista" 200 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" "${AUTH_U[@]}" -d "{\"token\":\"$TOK2\"}"
NUOVO=$(cat /tmp/w1body | j "['stato']")
eq "il nuovo ciclo nasce in attesa" "in_attesa" "$NUOVO"
eq "la riga revocata resta revocata" "revocata" "$(psql_q -c "SELECT stato FROM collegamenti_commercialista WHERE id=$COLL;")"
eq "il nuovo ciclo e' una riga distinta" "2" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE user_id=$CLI;")"
assert_http "e non da' accesso finche' non e' accettato" 403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"

echo
echo "=== J. collegamento di un altro utente ==="
UT2=$(curl -s -X POST $API/auth/register "${AUTH_U[@]}" -d "{\"username\":\"altro$SFX\",\"email\":\"a$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
assert_http "transizione su collegamento altrui -> 404" 404 \
  -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT2" "${AUTH_U[@]}" -d '{}'
assert_http "chat su collegamento altrui -> 404" 404 "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT2"

echo
echo "=== K. la colonna generata attivo resta in sola lettura ==="
SCRITTURA=$(docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA \
  -c "UPDATE collegamenti_commercialista SET attivo = TRUE WHERE id = $COLL;" 2>&1 | head -1)
case "$SCRITTURA" in
  *"can only be updated to DEFAULT"*) ok "scrittura su attivo rifiutata dal database" ;;
  *) ko "scrittura su attivo rifiutata dal database" "errore di colonna generata" "$SCRITTURA" ;;
esac

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
