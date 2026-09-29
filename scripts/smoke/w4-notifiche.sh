#!/usr/bin/env bash
# Smoke test delle notifiche email (blocco W4, migration 006).
#
# Verifica, leggendo le mail davvero consegnate a un server SMTP di prova (mailpit):
#   * ogni transizione del collegamento accoda e spedisce la sua mail, al lato giusto;
#   * la richiesta ripetuta dopo un rifiuto non manda una seconda mail (7 giorni);
#   * il promemoria dei messaggi non letti parte una volta, senza il testo della chat;
#   * un evento superato non viene spedito;
#   * SMTP giu': si ritenta, poi si arrende; nei log niente indirizzi;
#   * la notifica e' nella stessa transazione della transizione;
#   * un nome con a capo non diventa un header;
#   * due backend sulla stessa coda non spediscono la stessa riga due volte.
#
# Il backend deve girare con SMTP verso mailpit e giri rapidi, per esempio:
#   NOTIFICHE_INTERVALLO_MS=500 NOTIFICHE_BACKOFF_MS=1000 NOTIFICHE_MAX_TENTATIVI=3
#
#   API=http://localhost:3060/api API2=http://localhost:3061/api \
#   DB_CONTAINER=pn-w4-db MAIL_API=http://localhost:55462 MAIL_CONTAINER=pn-w4-mail \
#   BACKEND_LOG=/tmp/pn-w4-backend.log BACKEND_LOG2=/tmp/pn-w4-backend2.log ./scripts/smoke/w4-notifiche.sh
#
# API2 (secondo backend sulla stessa base) e' facoltativo: senza, la sezione J fallisce.
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
API2="${API2:-}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
MAIL_API="${MAIL_API:-http://localhost:8025}"
MAIL_CONTAINER="${MAIL_CONTAINER:-}"
BACKEND_LOG="${BACKEND_LOG:-}"
BACKEND_LOG2="${BACKEND_LOG2:-}"   # log del secondo backend (API2): i giri se li dividono
SFX="${SFX:-$(date +%s)$RANDOM}"

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s --max-time 10 -o /tmp/w4body -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"; else ko "$desc" "HTTP $atteso" "HTTP $got — $(head -c 200 /tmp/w4body)"; fi
}

# Mail consegnate a un indirizzo (mailpit), eventualmente filtrate per oggetto.
mail_a() {
  curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower(); sub='''${2:-}'''
print(sum(1 for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[])) and sub in m.get('Subject','')))" 2>/dev/null || echo "-"
}
# Testo della mail piu' recente per un indirizzo.
testo_a() {
  local id; id=$(curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower()
ms=[m for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[]))]
print(ms[0]['ID'] if ms else '')" 2>/dev/null)
  [ -n "$id" ] && curl -s --max-time 5 "$MAIL_API/api/v1/message/$id"
}
# Attende finche' il comando restituisce il valore atteso (max ~15 s).
attendi() {
  local atteso="$1"; shift
  local v
  for _ in $(seq 1 30); do v=$("$@"); [ "$v" = "$atteso" ] && { echo "$v"; return; }; sleep 0.5; done
  echo "$v"
}
notifiche() { psql_q -c "SELECT count(*) FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id WHERE $1;"; }
stato_notifica() { psql_q -c "SELECT stato FROM notifiche WHERE id=$1;"; }

registra_utente() {
  curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\"}" | j "['token']"
}
registra_studio() {
  curl -s -X POST $API/commercialisti/register "${JSON[@]}" \
    -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"$2\"}" | j "['token']"
}
richiedi() {
  curl -s -o /dev/null -w "%{http_code}" -X POST $API/commercialisti/richieste -H "Authorization: Bearer $1" "${JSON[@]}" \
    -d "{\"identificativo_cliente\":\"$2\"}"
}
collegamento_aperto() {
  psql_q -c "SELECT c.id FROM collegamenti_commercialista c JOIN commercialisti k ON k.id=c.commercialista_id JOIN utenti u ON u.id=c.user_id WHERE k.username='$1' AND u.username='$2' AND c.stato IN ('in_attesa','attiva','sospesa');"
}

echo "=== setup (suffisso $SFX) ==="
U="w4u$SFX"; C="w4c$SFX"
UT=$(registra_utente "$U")
CT=$(registra_studio "$C" "Studio W4 $SFX")
CLI=$(psql_q -c "SELECT id FROM utenti WHERE username='$U';")
eq "mailpit risponde" "0" "$(mail_a "$U@t.it")"

echo
echo "=== A. richiesta ricevuta -> mail al cliente ==="
eq "richiesta -> 202" "202" "$(richiedi "$CT" "$U")"
COLL=$(collegamento_aperto "$C" "$U")
eq "una notifica richiesta_ricevuta per il cliente" "1" \
  "$(notifiche "c.id=$COLL AND n.evento='richiesta_ricevuta' AND n.destinatario_tipo='user'")"
eq "la mail arriva al cliente" "1" "$(attendi 1 mail_a "$U@t.it" "chiede di collegarsi")"
TESTO=$(testo_a "$U@t.it")
if echo "$TESTO" | grep -q "Studio W4 $SFX"; then ok "la mail nomina lo studio"; else ko "la mail nomina lo studio" "Studio W4 $SFX" "$(echo "$TESTO" | head -c 200)"; fi
if echo "$TESTO" | grep -q "http://app.test/commercialista-management"; then ok "e porta alla pagina dove si accetta"; else ko "e porta alla pagina dove si accetta" "link" "assente"; fi
eq "la riga risulta inviata" "inviata" "$(psql_q -c "SELECT stato FROM notifiche WHERE collegamento_id=$COLL AND evento='richiesta_ricevuta';")"
eq "nessuna mail allo studio per la propria richiesta" "0" "$(mail_a "$C@t.it")"

echo
echo "=== B. rifiuto, e la richiesta ripetuta non manda altra posta ==="
assert_http "il cliente rifiuta" 200 -X PUT "$API/utenti/collegamenti/$COLL/rifiuta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "lo studio riceve il rifiuto" "1" "$(attendi 1 mail_a "$C@t.it" "ha rifiutato")"
eq "lo studio ribussa -> 202" "202" "$(richiedi "$CT" "$U")"
COLL=$(collegamento_aperto "$C" "$U")
eq "la nuova richiesta e' in attesa, visibile in app" "in_attesa" "$(psql_q -c "SELECT stato FROM collegamenti_commercialista WHERE id=$COLL;")"
eq "ma nessuna nuova notifica di richiesta" "0" "$(notifiche "c.id=$COLL AND n.evento='richiesta_ricevuta'")"
sleep 1.5
eq "e nessuna seconda mail al cliente" "1" "$(mail_a "$U@t.it" "chiede di collegarsi")"

echo
echo "=== C. accettazione, sospensione, riattivazione -> mail allo studio ==="
assert_http "il cliente accetta" 200 -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "lo studio riceve l'accettazione" "1" "$(attendi 1 mail_a "$C@t.it" "ha accettato")"
assert_http "il cliente sospende" 200 -X PUT "$API/utenti/collegamenti/$COLL/sospendi" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "lo studio riceve la sospensione" "1" "$(attendi 1 mail_a "$C@t.it" "ha sospeso")"
assert_http "il cliente riattiva" 200 -X PUT "$API/utenti/collegamenti/$COLL/riattiva" -H "Authorization: Bearer $UT"
eq "lo studio riceve la riattivazione" "1" "$(attendi 1 mail_a "$C@t.it" "ha riattivato")"
eq "il cliente non riceve mail per le proprie azioni" "1" "$(mail_a "$U@t.it")"

echo
echo "=== D. promemoria messaggi non letti ==="
SEGRETO="TESTO-CHAT-RISERVATO-$SFX"
assert_http "il cliente scrive allo studio" 201 -X POST "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT" "${JSON[@]}" \
  -d "{\"messaggio\":\"$SEGRETO\"}"
sleep 1.5
eq "un messaggio recente non produce promemoria" "0" "$(notifiche "c.id=$COLL AND n.evento='messaggi_non_letti'")"
psql_q -c "UPDATE messaggi_commercialista SET created_at = NOW() - INTERVAL '5 hours' WHERE collegamento_id=$COLL;" >/dev/null
eq "non letto da 5 ore -> promemoria allo studio" "1" "$(attendi 1 mail_a "$C@t.it" "messaggi non letti")"
TESTO=$(testo_a "$C@t.it")   # la piu' recente per lo studio e' il promemoria
if echo "$TESTO" | grep -q "$SEGRETO"; then ko "il promemoria non riporta il testo della chat" "assente" "presente"; else ok "il promemoria non riporta il testo della chat"; fi
if echo "$TESTO" | grep -q "Hai 1 messaggi non letti"; then ok "riporta solo quanti sono"; else ko "riporta solo quanti sono" "Hai 1 messaggi non letti" "$(echo "$TESTO" | head -c 200)"; fi
sleep 1.5
eq "gli stessi messaggi non producono un secondo promemoria" "1" "$(notifiche "c.id=$COLL AND n.evento='messaggi_non_letti' AND n.destinatario_tipo='commercialista'")"
curl -s -X POST "$API/messaggi?collegamentoId=$COLL" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"messaggio":"secondo"}' >/dev/null
psql_q -c "UPDATE messaggi_commercialista SET created_at = NOW() - INTERVAL '5 hours' WHERE collegamento_id=$COLL;" >/dev/null
sleep 1.5
eq "un nuovo messaggio entro 24 ore non ne produce un altro" "1" "$(notifiche "c.id=$COLL AND n.evento='messaggi_non_letti' AND n.destinatario_tipo='commercialista'")"
assert_http "lo studio scrive al cliente" 201 -X POST "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"messaggio":"risposta"}'
psql_q -c "UPDATE messaggi_commercialista SET created_at = NOW() - INTERVAL '5 hours' WHERE collegamento_id=$COLL AND mittente_tipo='commercialista';" >/dev/null
eq "e il cliente riceve il suo promemoria" "1" "$(attendi 1 mail_a "$U@t.it" "messaggi non letti")"

echo
echo "=== E. un evento superato non si spedisce ==="
# Riga "richiesta ricevuta" su un collegamento ormai attivo: il cliente ha gia' risposto.
NID=$(psql_q -c "INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento) VALUES ($COLL,'user','richiesta_ricevuta') RETURNING id;" | head -1)
eq "la riga superata viene annullata" "annullata" "$(attendi annullata stato_notifica "$NID")"
eq "e il cliente non riceve una seconda richiesta" "1" "$(mail_a "$U@t.it" "chiede di collegarsi")"

echo
echo "=== F. revoche -> mail al lato che non ha revocato ==="
assert_http "il cliente revoca" 200 -X DELETE "$API/utenti/collegamenti/$COLL" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "lo studio riceve la revoca" "1" "$(attendi 1 mail_a "$C@t.it" "ha revocato")"
eq "nessuna notifica di revoca al cliente che ha revocato" "0" \
  "$(notifiche "c.id=$COLL AND n.evento='collegamento_revocato' AND n.destinatario_tipo='user'")"
C2="w4d$SFX"; CT2=$(registra_studio "$C2" "Studio Due $SFX")
richiedi "$CT2" "$U" >/dev/null
COLL2=$(collegamento_aperto "$C2" "$U")
curl -s -X PUT "$API/utenti/collegamenti/$COLL2/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}' >/dev/null
assert_http "lo studio due si disconnette" 200 -X DELETE "$API/commercialisti/clienti/$CLI" -H "Authorization: Bearer $CT2" "${JSON[@]}" -d '{}'
eq "il cliente riceve la chiusura" "1" "$(attendi 1 mail_a "$U@t.it" "ha chiuso il collegamento")"
eq "lo studio che ha chiuso non riceve niente" "0" "$(mail_a "$C2@t.it" "revocato")"

echo
echo "=== G. SMTP giu': si ritenta, poi ci si arrende ==="
if [ -z "$MAIL_CONTAINER" ]; then
  ko "sezione G" "MAIL_CONTAINER impostato" "assente"
else
  C3="w4e$SFX"; CT3=$(registra_studio "$C3" "Studio Tre $SFX")
  docker stop "$MAIL_CONTAINER" >/dev/null
  richiedi "$CT3" "$U" >/dev/null
  N3=$(psql_q -c "SELECT n.id FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id JOIN commercialisti k ON k.id=c.commercialista_id WHERE k.username='$C3';")
  eq "con SMTP giu' la riga si arrende dopo i tentativi" "fallita" "$(attendi fallita stato_notifica "$N3")"
  eq "tre tentativi, con un codice d'errore e nient'altro" "3|true" \
    "$(psql_q -c "SELECT tentativi||'|'||(ultimo_errore ~ '^E[A-Z]+$') FROM notifiche WHERE id=$N3;")"

  C4="w4f$SFX"; CT4=$(registra_studio "$C4" "Studio Quattro $SFX")
  richiedi "$CT4" "$U" >/dev/null
  N4=$(psql_q -c "SELECT n.id FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id JOIN commercialisti k ON k.id=c.commercialista_id WHERE k.username='$C4';")
  eq "il primo tentativo fallisce e la riga resta in coda" "1|in_coda" \
    "$(attendi "1|in_coda" psql_q -c "SELECT tentativi||'|'||stato FROM notifiche WHERE id=$N4;")"
  docker start "$MAIL_CONTAINER" >/dev/null
  for _ in $(seq 1 20); do curl -s --max-time 1 "$MAIL_API/api/v1/messages" >/dev/null && break; sleep 0.5; done
  eq "tornato SMTP, il nuovo tentativo consegna" "inviata" "$(attendi inviata stato_notifica "$N4")"
  eq "la mail c'e'" "1" "$(attendi 1 mail_a "$U@t.it" "Studio Quattro")"
  eq "la riga arresa non riparte da sola" "fallita" "$(stato_notifica "$N3")"
fi

echo
echo "=== H. nei log niente indirizzi ne' testi ==="
if [ -z "$BACKEND_LOG" ] || [ ! -f "$BACKEND_LOG" ]; then
  ko "i log del backend sono leggibili" "BACKEND_LOG" "assente"
else
  leggi_log() { cat "$BACKEND_LOG"; [ -n "$BACKEND_LOG2" ] && [ -f "$BACKEND_LOG2" ] && cat "$BACKEND_LOG2"; true; }
  if leggi_log | grep -q "notifica $N4: invio non riuscito"; then ok "il log registra i tentativi falliti"; else ko "il log registra i tentativi falliti" "riga presente" "assente"; fi
  eq "l'indirizzo del cliente non compare" "0" "$(leggi_log | grep -c "$U@t.it")"
  eq "l'indirizzo dello studio non compare" "0" "$(leggi_log | grep -c "$C@t.it")"
  eq "il testo della chat non compare" "0" "$(leggi_log | grep -c "$SEGRETO")"
fi

echo
echo "=== I. la notifica e' nella stessa transazione della transizione ==="
C5="w4g$SFX"; CT5=$(registra_studio "$C5" "Studio Cinque $SFX")
richiedi "$CT5" "$U" >/dev/null
COLL5=$(collegamento_aperto "$C5" "$U")
psql_q -c "ALTER TABLE notifiche RENAME TO notifiche_guasta;" >/dev/null
assert_http "coda non scrivibile -> l'accettazione fallisce" 500 -X PUT "$API/utenti/collegamenti/$COLL5/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
psql_q -c "ALTER TABLE notifiche_guasta RENAME TO notifiche;" >/dev/null
eq "e il collegamento resta in attesa" "in_attesa" "$(psql_q -c "SELECT stato FROM collegamenti_commercialista WHERE id=$COLL5;")"
assert_http "ripristinata la coda, l'accettazione riesce" 200 -X PUT "$API/utenti/collegamenti/$COLL5/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "con la sua notifica" "1" "$(notifiche "c.id=$COLL5 AND n.evento='richiesta_accettata'")"

echo
echo "=== L. un nome con a capo non diventa un header ==="
C6="w4h$SFX"
CT6=$(registra_studio "$C6" "Studio Sei\\r\\nBcc: intruso$SFX@t.it")
eq "studio con nome malevolo registrato" "0" "$([ "$CT6" = "-" ] && echo 1 || echo 0)"
richiedi "$CT6" "$U" >/dev/null
eq "la mail arriva al cliente" "1" "$(attendi 1 mail_a "$U@t.it" "Studio Sei")"
eq "nessuna copia all'intruso" "0" "$(mail_a "intruso$SFX@t.it")"
BCC=$(curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(sum(len(m.get('Bcc') or [])+len(m.get('Cc') or []) for m in d['messages'] if 'Studio Sei' in m.get('Subject','')))")
eq "nessun Bcc o Cc nella mail" "0" "$BCC"

echo
echo "=== J. due backend sulla stessa coda: nessun doppione ==="
if [ -z "$API2" ]; then
  ko "sezione J" "API2 impostato" "assente"
else
  U2="w4v$SFX"; registra_utente "$U2" >/dev/null
  for k in $(seq 1 12); do
    T=$(registra_studio "w4s${k}x$SFX" "Studio Coda $k $SFX")
    richiedi "$T" "$U2" >/dev/null
  done
  eq "dodici notifiche in coda" "12" "$(psql_q -c "SELECT count(*) FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id JOIN utenti u ON u.id=c.user_id WHERE u.username='$U2';")"
  eq "dodici mail, non una di piu'" "12" "$(attendi 12 mail_a "$U2@t.it")"
  sleep 2
  eq "e restano dodici" "12" "$(mail_a "$U2@t.it")"
  eq "tutte le righe inviate" "12" "$(psql_q -c "SELECT count(*) FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id JOIN utenti u ON u.id=c.user_id WHERE u.username='$U2' AND n.stato='inviata';")"
fi

echo
echo "=== K. eliminazione dell'account: la coda del cliente va via in cascata ==="
PRIMA_K=$(psql_q -c "SELECT count(*) FROM notifiche WHERE collegamento_id IN ($COLL,$COLL2,$COLL5);")
if [ "${PRIMA_K:-0}" -gt 0 ]; then ok "prima dell'eliminazione il cliente ha notifiche ($PRIMA_K)"; else ko "prima dell'eliminazione il cliente ha notifiche" ">0" "$PRIMA_K"; fi
assert_http "il cliente elimina l'account" 200 -X DELETE "$API/auth/account" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"password":"Password123!"}'
eq "nessuna notifica residua del cliente" "0" "$(psql_q -c "SELECT count(*) FROM notifiche WHERE collegamento_id IN ($COLL,$COLL2,$COLL5);")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
