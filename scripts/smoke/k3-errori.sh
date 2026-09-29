#!/usr/bin/env bash
# Smoke test del blocco K3: errori e log.
#
# Provoca errori veri (id non numerici che fanno esplodere pg, filtri che
# rompono la query dell'export, righe di backup e di CSV rifiutate dal
# database, password non stringa, charset sconosciuto) e verifica che:
#   A. le risposte non contengano testo di pg, stack, `details` col messaggio
#      interno, ne' messaggi di librerie (bcrypt, body-parser);
#   B. i messaggi applicativi scritti da noi restino (RAISE EXCEPTION delle
#      funzioni SQL, righe d'import con testo nostro);
#   C. il log del backend, per la parte scritta durante questa corsa, non
#      contenga username, email, nomi di anagrafiche/categorie/conti usati nel
#      test, i valori mandati nel corpo, ne' messaggi di pg.
#
#   API=http://localhost:3001/api BACKEND_LOG=/tmp/backend.log ./scripts/smoke/k3-errori.sh
#   API=... BACKEND_CONTAINER=prima_nota_backend ./scripts/smoke/k3-errori.sh
#
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
BACKEND_LOG="${BACKEND_LOG:-}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-}"
SFX="${SFX:-$(date +%s)$RANDOM}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }

leggi_log() {
  if [ -n "$BACKEND_LOG" ] && [ -f "$BACKEND_LOG" ]; then cat "$BACKEND_LOG"
  elif [ -n "$BACKEND_CONTAINER" ]; then docker logs "$BACKEND_CONTAINER" 2>&1
  else return 1; fi
}
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s -o "$T/body" -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")

# Testo che non deve mai arrivare al client: messaggi di pg, di librerie, stack.
INTERNI='invalid input syntax|violates|numeric field overflow|value too long|out of range|does not exist|syntax error|Illegal arguments|unsupported charset|charset|at [^ ]+\.js:[0-9]+|node_modules|"stack"|"details"|TypeError|ReferenceError|Cannot read'

# pulita <descrizione> <status atteso (regex)> <curl args...>
pulita() {
  local desc="$1" atteso="$2"; shift 2
  local st; st=$(hit "$@")
  if ! [[ "$st" =~ ^($atteso)$ ]]; then
    ko "$desc: status" "$atteso" "HTTP $st — $(head -c 200 "$T/body")"
  elif grep -qiE "$INTERNI" "$T/body"; then
    ko "$desc: nessun testo interno nella risposta" "niente pg/stack/details" "$(grep -oiE "$INTERNI" "$T/body" | head -3 | tr '\n' ' ') — $(head -c 200 "$T/body")"
  else
    ok "$desc -> HTTP $st, risposta pulita"
  fi
}

echo "=== 0. i log sono leggibili ==="
if ! leggi_log >/dev/null 2>&1; then
  ko "i log del backend sono leggibili" "BACKEND_LOG o BACKEND_CONTAINER" "nessuno dei due"
  echo; printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"; exit 1
fi
ok "i log del backend sono leggibili"
INIZIO=$(leggi_log | wc -c | tr -d ' ')     # si guarda solo cio' che scrive questa corsa
log_corsa() { leggi_log | tail -c +"$((INIZIO + 1))"; }

# Sentinelle uniche per corsa.
U="k3u$SFX"; EMAIL="k3m$SFX@t.it"; PW="K3pw${SFX}Aa!"
CAT="K3cat$SFX"; ANA="K3ana$SFX"; CONTO="K3conto$SFX"; VAL="K3val$SFX"; URLID="K3id$SFX"
C="k3c$SFX"; CEMAIL="k3c$SFX@t.it"

echo
echo "=== A. utente ==="
eq "registrazione" "201" "$(hit -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"$U\",\"email\":\"$EMAIL\",\"password\":\"$PW\"}")"
UT=$(j "['token']" < "$T/body")
AU=(-H "Authorization: Bearer $UT")

echo
echo "=== B. errori del database: niente testo di pg nelle risposte ==="
for r in movimenti anagrafiche conti-bancari; do
  pulita "GET /$r/<id non numerico>" "4[0-9][0-9]|500" "${AU[@]}" "$API/$r/$URLID"
done
pulita "GET /anagrafiche/<id>/statistiche non numerico" "4[0-9][0-9]|500" "${AU[@]}" "$API/anagrafiche/$URLID/statistiche"
pulita "DELETE /alerts/<id non numerico>" "4[0-9][0-9]|500" -X DELETE "${AU[@]}" "$API/alerts/$URLID"
pulita "POST /export/generate con conto_id che rompe la query" "4[0-9][0-9]|500" \
  -X POST "${AU[@]}" "${JSON[@]}" $API/export/generate -d "{\"export_type\":\"semplice\",\"conto_id\":\"$VAL\",\"tutto_storico\":true,\"ordina_per\":\"data\",\"ordine\":\"desc\",\"formato\":\"json\"}"
pulita "POST /export/preview con conto_id che rompe la query" "4[0-9][0-9]|500" \
  -X POST "${AU[@]}" "${JSON[@]}" $API/export/preview -d "{\"export_type\":\"semplice\",\"conto_id\":\"$VAL\",\"tutto_storico\":true,\"ordina_per\":\"data\",\"ordine\":\"desc\",\"formato\":\"json\"}"

echo
echo "=== C. import: righe rifiutate dal database, motivo scritto da noi ==="
BK="{\"mode\":\"merge\",\"backupData\":{\"metadata\":{\"version\":\"1.0\",\"app_name\":\"Prima Nota Contabile\"},\"user\":{\"id\":1},
 \"conti_correnti\":[{\"id\":1,\"nome_banca\":\"$CONTO\",\"intestatario\":\"X\",\"saldo_iniziale\":\"$VAL\",\"attivo\":true}]}}"
pulita "backup/import con un conto che il database rifiuta" "200" -X POST "${AU[@]}" "${JSON[@]}" $API/auth/backup/import -d "$BK"
eq "l'errore della riga e' il nostro testo" "Conto $CONTO: dati non validi" "$(j "['results']['errors'][0]" < "$T/body")"

CSV=$(printf 'Data;Descrizione;Importo;Tipo;Anagrafica;Conto\\n2025-01-15;Riga %s;99999999999999999999;Entrata;%s;%s\\n2025-01-16;Riga buona;10,00;Uscita;%s;%s' "$SFX" "$ANA" "$CONTO" "$ANA" "$CONTO")
pulita "movimenti/import CSV con un importo fuori scala" "200|400" -X POST "${AU[@]}" "${JSON[@]}" $API/movimenti/import -d "{\"csvData\":\"$CSV\"}"
eq "l'errore della riga e' il nostro testo" "Riga 1: dati non validi" "$(j "['stats']['warnings'][0]" < "$T/body")"
eq "la riga buona e' importata" "1" "$(j "['stats']['movimenti_importati']" < "$T/body")"

echo
echo "=== D. account, parser, messaggi applicativi ==="
pulita "DELETE /auth/account con password non stringa" "400" -X DELETE "${AU[@]}" "${JSON[@]}" $API/auth/account -d '{"password":12345678}'
pulita "corpo con charset sconosciuto" "415" -X POST "${AU[@]}" -H "Content-Type: application/json; charset=k3-nessuno" $API/categorie-movimenti -d '{}'
eq "categoria creata" "201" "$(hit -X POST "${AU[@]}" "${JSON[@]}" $API/categorie-movimenti -d "{\"nome\":\"$CAT\",\"tipo\":\"Entrata\"}")"
eq "categoria doppia rifiutata" "400" "$(hit -X POST "${AU[@]}" "${JSON[@]}" $API/categorie-movimenti -d "{\"nome\":\"$CAT\",\"tipo\":\"Entrata\"}")"
eq "statistiche account" "200" "$(hit "${AU[@]}" $API/auth/account/stats)"

eq "registrazione studio" "201" "$(hit -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"$C\",\"email\":\"$CEMAIL\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio K3\"}")"
CT=$(j "['token']" < "$T/body")
TOK=$(python3 -c "import secrets;print(secrets.token_hex(32))")
pulita "collega-cliente con token inesistente" "400" -X POST -H "Authorization: Bearer $CT" "${JSON[@]}" $API/commercialisti/collega-cliente -d "{\"token\":\"$TOK\"}"
eq "il messaggio della funzione SQL (RAISE, testo nostro) resta" "Token non valido" "$(j "['error']" < "$T/body")"

eq "eliminazione account con la password giusta" "200" "$(hit -X DELETE "${AU[@]}" "${JSON[@]}" $API/auth/account -d "{\"password\":\"$PW\"}")"

echo
echo "=== E. log del backend (solo questa corsa) ==="
sleep 1
RIGHE=$(log_corsa | grep -cF "/api/movimenti/$URLID" || true)
if [ "${RIGHE:-0}" -gt 0 ]; then ok "il log registra il traffico di questa corsa ($RIGHE righe)"
else ko "il log registra il traffico di questa corsa" ">0 righe con /api/movimenti/$URLID" "0"; fi
for coppia in "username:$U" "email:$EMAIL" "username studio:$C" "email studio:$CEMAIL" "password:$PW" \
              "nome categoria:$CAT" "nome anagrafica:$ANA" "nome conto:$CONTO" "valore nel corpo:$VAL"; do
  nome="${coppia%%:*}"; val="${coppia#*:}"
  eq "$nome non compare nel log" "0" "$(log_corsa | grep -cF "$val" || true)"
done
for t in 'invalid input syntax' 'numeric field overflow' 'Illegal arguments' 'unsupported charset'; do
  eq "nessun messaggio interno nel log: '$t'" "0" "$(log_corsa | grep -cF "$t" || true)"
done
eq "nessuno stack nel log" "0" "$(log_corsa | grep -cE '^\s+at .+:[0-9]+:[0-9]+\)?$' || true)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
