#!/usr/bin/env bash
# Smoke test del registro accessi del commercialista (blocco W3, migration 005).
#
# Verifica che:
#   * ogni accesso concesso ai dati del cliente lasci una riga, scritta PRIMA dei
#     dati: se il registro non si scrive, i dati non escono (fail-closed);
#   * gli accessi negati o malformati non lascino righe;
#   * dashboard e chat, che interrogano spesso, lascino una riga all'ora;
#   * il registro sia leggibile dal cliente e solo da lui;
#   * il database impedisca di riscrivere o cancellare le righe, salvo la cascata
#     dall'eliminazione dell'account.
#
#   API=http://localhost:3050/api DB_CONTAINER=pn-w3-db ./scripts/smoke/w3-accessi.sh
#
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"

PASS=0; FAIL=0
psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s -o /tmp/w3body -w "%{http_code}" "$@"; }
body(){ head -c 220 /tmp/w3body; }
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"; else ko "$desc" "HTTP $atteso" "HTTP $got — $(body)"; fi
}
JSON=(-H "Content-Type: application/json")

# righe <tipo>: righe di registro per il collegamento di prova e quel tipo
righe() { psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='$1';"; }
totale() { psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL;"; }

echo "=== setup (suffisso $SFX) ==="
UT=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w3u$SFX\",\"email\":\"w3u$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
U2=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w3v$SFX\",\"email\":\"w3v$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
CT=$(curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"w3c$SFX\",\"email\":\"w3c$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio W3\"}" | j "['token']")
CLI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT" | j "['id']")

curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"nome_banca":"Banca Ammessa","intestatario":"W3","saldo_iniziale":1000}' >/dev/null
curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"nome_banca":"Banca Negata","intestatario":"W3","saldo_iniziale":500}' >/dev/null
CONTO_OK=$(curl -s "$API/conti-bancari" -H "Authorization: Bearer $UT" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin) if c['nome_banca']=='Banca Ammessa'][0])")
CONTO_NO=$(curl -s "$API/conti-bancari" -H "Authorization: Bearer $UT" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin) if c['nome_banca']=='Banca Negata'][0])")
mov() { curl -s -X POST $API/movimenti -H "Authorization: Bearer $UT" "${JSON[@]}" \
  -d "{\"data\":\"$1\",\"conto_id\":$2,\"descrizione\":\"$3\",\"importo\":$4,\"tipo\":\"Entrata\"}" >/dev/null; }
mov 2025-06-01 "$CONTO_OK" "W3-A" 100
mov 2025-06-02 "$CONTO_OK" "W3-B" 150
mov 2025-06-03 "$CONTO_NO" "W3-FUORI" 200

curl -s -X POST $API/commercialisti/richieste -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"identificativo_cliente\":\"w3u$SFX\"}" >/dev/null
COLL=$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $UT" | j "['collegamenti'][0]['id']")
echo "user_id=$CLI collegamento=$COLL conto_ammesso=$CONTO_OK"

echo
echo "=== A. prima dell'accettazione nessun accesso, nessuna riga ==="
assert_http "dettaglio in attesa -> 403" 403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
eq "l'accesso negato non lascia righe" "0" "$(totale)"
curl -s -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" \
  -d "{\"conti_ammessi\":[$CONTO_OK]}" >/dev/null
assert_http "il cliente legge il proprio registro" 200 "$API/utenti/collegamenti/$COLL/accessi" -H "Authorization: Bearer $UT"
eq "registro vuoto dopo l'accettazione" "0" "$(j "['totale']" < /tmp/w3body)"

echo
echo "=== B. dettaglio cliente ==="
assert_http "dettaglio -> 200" 200 "$API/commercialisti/clienti/$CLI?page=1&limit=20" -H "Authorization: Bearer $CT"
eq "una riga dettaglio_cliente" "1" "$(righe dettaglio_cliente)"
eq "la riga registra la paginazione" "1|20" \
  "$(psql_q -c "SELECT dettagli->>'page' || '|' || (dettagli->>'limit') FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='dettaglio_cliente';")"
eq "e la fotografia dell'ambito in vigore" "[$CONTO_OK]" \
  "$(psql_q -c "SELECT dettagli->'ambito'->>'conti' FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='dettaglio_cliente';")"
assert_http "paginazione non valida -> 400" 400 "$API/commercialisti/clienti/$CLI?limit=100000" -H "Authorization: Bearer $CT"
eq "la richiesta respinta non lascia righe" "1" "$(righe dettaglio_cliente)"

echo
echo "=== C. export ==="
assert_http "export json -> 200" 200 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d '{"export_type":"semplice","formato":"json","tutto_storico":true}'
NREC=$(j "['metadata']['numero_record']" < /tmp/w3body)
eq "l'export restituisce i 2 movimenti in ambito" "2" "$NREC"
eq "una riga export" "1" "$(righe export)"
eq "la riga dice quanti record sono usciti" "$NREC" \
  "$(psql_q -c "SELECT numero_record FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='export';")"
eq "e con che formato e tipo" "json|semplice" \
  "$(psql_q -c "SELECT (dettagli->>'formato') || '|' || (dettagli->>'export_type') FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='export';")"
assert_http "export csv -> 200" 200 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d '{"export_type":"commercialista","formato":"csv","tutto_storico":true}'
eq "anche il file scaricato ha la sua riga, con i record" "2" \
  "$(psql_q -c "SELECT numero_record FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='export' AND dettagli->>'formato'='csv';")"
assert_http "export malformato -> 400" 400 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d '{"export_type":"inventato","formato":"json"}'
eq "l'export malformato non lascia righe" "2" "$(righe export)"
assert_http "export su conto fuori ambito -> 403" 403 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d "{\"export_type\":\"semplice\",\"formato\":\"json\",\"tutto_storico\":true,\"conto_id\":$CONTO_NO}"
eq "il tentativo resta, senza record usciti" "1" \
  "$(psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='export' AND numero_record IS NULL;")"

echo
echo "=== D. dashboard e chat: una riga all'ora ==="
for i in 1 2 3; do curl -s $API/commercialisti/dashboard -H "Authorization: Bearer $CT" -o /dev/null; done
eq "tre dashboard, una riga lista_clienti" "1" "$(righe lista_clienti)"
for i in 1 2 3; do curl -s "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT" -o /dev/null; done
curl -s "$API/messaggi/clients-overview" -H "Authorization: Bearer $CT" -o /dev/null
eq "tre letture chat e un'anteprima, una riga chat" "1" "$(righe chat)"
curl -s "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT" -o /dev/null
eq "il cliente che legge la propria chat non si registra" "1" "$(righe chat)"

echo
echo "=== E. il registro e' del cliente ==="
assert_http "il cliente vede i propri accessi" 200 "$API/utenti/collegamenti/$COLL/accessi" -H "Authorization: Bearer $UT"
eq "totale coerente con il database" "$(totale)" "$(j "['totale']" < /tmp/w3body)"
eq "il piu' recente per primo" "chat" "$(j "['accessi'][0]['tipo_accesso']" < /tmp/w3body)"
assert_http "un altro utente -> 404" 404 "$API/utenti/collegamenti/$COLL/accessi" -H "Authorization: Bearer $U2"

echo
echo "=== F. il database non lascia riscrivere il registro ==="
RID=$(psql_q -c "SELECT id FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='dettaglio_cliente';")
psql_q -c "UPDATE accessi_commercialista SET tipo_accesso='chat' WHERE id=$RID;" >/dev/null 2>&1
eq "UPDATE del tipo rifiutato" "dettaglio_cliente" "$(psql_q -c "SELECT tipo_accesso FROM accessi_commercialista WHERE id=$RID;")"
psql_q -c "UPDATE accessi_commercialista SET created_at='2000-01-01' WHERE id=$RID;" >/dev/null 2>&1
eq "UPDATE della data rifiutato" "0" "$(psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE id=$RID AND created_at < '2001-01-01';")"
EID=$(psql_q -c "SELECT id FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='export' AND numero_record IS NOT NULL LIMIT 1;")
psql_q -c "UPDATE accessi_commercialista SET numero_record=0 WHERE id=$EID;" >/dev/null 2>&1
eq "numero_record non si riscrive" "2" "$(psql_q -c "SELECT numero_record FROM accessi_commercialista WHERE id=$EID;")"
psql_q -c "DELETE FROM accessi_commercialista WHERE id=$RID;" >/dev/null 2>&1
eq "DELETE diretto rifiutato" "1" "$(psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE id=$RID;")"
psql_q -c "INSERT INTO accessi_commercialista (collegamento_id, commercialista_id, user_id, tipo_accesso) SELECT $COLL, commercialista_id, $CLI + 100000, 'export' FROM collegamenti_commercialista WHERE id=$COLL;" >/dev/null 2>&1
eq "riga imputata al cliente sbagliato rifiutata" "0" \
  "$(psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL AND user_id<>$CLI;")"

echo
echo "=== G. fail-closed: senza registro niente dati ==="
psql_q -c "ALTER TABLE accessi_commercialista RENAME TO accessi_commercialista_guasta;" >/dev/null
assert_http "registro non scrivibile -> 500" 500 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
if grep -q "W3-A" /tmp/w3body; then ko "e nessun movimento nella risposta" "nessun W3-A" "$(body)"; else ok "e nessun movimento nella risposta"; fi
assert_http "export con registro non scrivibile -> 500" 500 -X POST "$API/commercialisti/clienti/$CLI/export" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d '{"export_type":"semplice","formato":"json","tutto_storico":true}'
if grep -q "W3-A" /tmp/w3body; then ko "e nessun dato esportato" "nessun W3-A" "$(body)"; else ok "e nessun dato esportato"; fi
assert_http "dashboard con registro non scrivibile -> 500" 500 "$API/commercialisti/dashboard" -H "Authorization: Bearer $CT"
psql_q -c "ALTER TABLE accessi_commercialista_guasta RENAME TO accessi_commercialista;" >/dev/null
assert_http "registro ripristinato -> 200" 200 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"

echo
echo "=== H. disconnessione ==="
assert_http "il commercialista si disconnette" 200 -X DELETE "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{}'
eq "una riga disconnessione" "1" "$(righe disconnessione)"
PRIMA=$(totale)
assert_http "dopo la revoca il dettaglio -> 403" 403 "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT"
eq "l'accesso negato non aggiunge righe" "$PRIMA" "$(totale)"
assert_http "dopo la revoca il cliente legge ancora il registro" 200 "$API/utenti/collegamenti/$COLL/accessi" -H "Authorization: Bearer $UT"
eq "con tutte le righe" "$PRIMA" "$(j "['totale']" < /tmp/w3body)"

echo
echo "=== I. eliminazione dell'account: il registro va via in cascata ==="
assert_http "il cliente elimina l'account" 200 -X DELETE "$API/auth/account" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"password":"Password123!"}'
eq "nessuna riga residua del cliente" "0" "$(psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE user_id=$CLI;")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
