#!/usr/bin/env bash
# Smoke test dell'invito irrigidito (blocco W2).
#
# Copre le tre cose che la migration 003 cambia:
#   * il token esiste in chiaro solo nella risposta alla generazione: in tabella
#     c'e' un hash SHA-256, e nessuna route lo restituisce piu';
#   * un solo token attivo per utente, revocabile senza cancellare la riga;
#   * il commercialista puo' chiedere il collegamento nominando il cliente, e
#     l'endpoint risponde allo stesso modo che il cliente esista o no.
#
# Come lo smoke del W1 questo script ASSERISCE: esce 1 se anche un solo caso fallisce.
#
#   API=http://localhost:3010/api DB_CONTAINER=pn-w2-db \
#     BACKEND_LOG=/tmp/w2-backend.log ./scripts/smoke/w2-invito.sh
#
# La sezione G verifica che il token in chiaro non finisca nei log del backend e
# ha quindi bisogno di leggerli: o BACKEND_LOG (file su cui il processo scrive
# stdout+stderr) oppure BACKEND_CONTAINER (nome del container docker). Se non e'
# indicato ne' l'uno ne' l'altro la sezione FALLISCE: una prova sui log che non
# legge i log passerebbe sempre, ed e' proprio il modo in cui questo difetto era
# sfuggito al giro precedente.
#
# ATTENZIONE: se si ricrea il database bisogna RIAVVIARE anche il backend. Il
# contatore del rate limit sulle richieste sta in memoria ed e' indicizzato per
# id del commercialista: azzerando il database gli id ripartono da 1 e la sezione E
# della corsa precedente lascerebbe il budget gia' esaurito. In esercizio non
# succede, perche' gli id non vengono riusati.

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"

PASS=0; FAIL=0

psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s -o /tmp/w2body -w "%{http_code}" "$@"; }
body(){ head -c 220 /tmp/w2body; }

ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }

assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"
  else ko "$desc" "HTTP $atteso" "HTTP $got — $(body)"; fi
}

# assert_contiene <descrizione> <sottostringa attesa nel corpo>
assert_contiene() {
  if grep -qF "$2" /tmp/w2body; then ok "$1"
  else ko "$1" "corpo contiene \"$2\"" "$(body)"; fi
}

# Log del backend: file oppure container. Vedi l'avvertenza in testa allo script.
BACKEND_LOG="${BACKEND_LOG:-}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-}"
leggi_log() {
  if [ -n "$BACKEND_LOG" ] && [ -f "$BACKEND_LOG" ]; then cat "$BACKEND_LOG"
  elif [ -n "$BACKEND_CONTAINER" ]; then docker logs "$BACKEND_CONTAINER" 2>&1
  else return 1; fi
}

JSON=(-H "Content-Type: application/json")

echo "=== setup (suffisso $SFX) ==="
UT=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w2u$SFX\",\"email\":\"w2u$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
CT=$(curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"w2c$SFX\",\"email\":\"w2c$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio W2\"}" | j "['token']")
C2=$(curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"w2d$SFX\",\"email\":\"w2d$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio Due\"}" | j "['token']")
CLI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT" | j "['id']")
echo "user_id=$CLI"

echo
echo "=== A. il token in chiaro esiste solo nella risposta ==="
assert_http "generazione token" 200 -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
TOK=$(cat /tmp/w2body | j "['token']")
PREF=$(cat /tmp/w2body | j "['prefisso']")
eq "il prefisso sono i primi 8 caratteri del token" "${TOK:0:8}" "$PREF"

eq "la colonna in chiaro non esiste piu' in tabella" "0" \
  "$(psql_q -c "SELECT count(*) FROM information_schema.columns WHERE table_name='token_inviti' AND column_name='token';")"
eq "in tabella c'e' l'hash SHA-256 del token" "1" \
  "$(psql_q -c "SELECT count(*) FROM token_inviti WHERE token_hash = encode(sha256(convert_to('$TOK','UTF8')),'hex');")"
eq "il valore in chiaro non compare in nessuna colonna testuale" "0" \
  "$(psql_q -c "SELECT count(*) FROM token_inviti WHERE prefisso = '$TOK' OR token_hash = '$TOK';")"

curl -s $API/utenti/token-inviti -H "Authorization: Bearer $UT" -o /tmp/w2body
eq "la lista non restituisce alcun valore di token" "assente" \
  "$(python3 -c "
import json
d=json.load(open('/tmp/w2body'))
t=d['tokens'][0]
print('PRESENTE' if ('token' in t or any(v=='$TOK' for v in t.values() if isinstance(v,str))) else 'assente')")"
eq "la lista dichiara il token attivo" "True" "$(cat /tmp/w2body | j "['ha_token_attivo']")"

echo
echo "=== B. un solo token attivo per utente ==="
assert_http "secondo token mentre uno e' attivo -> 409" 409 \
  -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
eq "resta un solo token attivo" "1" \
  "$(psql_q -c "SELECT count(*) FROM token_inviti WHERE user_id=$CLI AND stato='attivo';")"
assert_http "validita' oltre 30 giorni -> 400" 400 \
  -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"giorni_validita":365}'

TOKID=$(psql_q -c "SELECT id FROM token_inviti WHERE user_id=$CLI AND stato='attivo';")
assert_http "revoca del token" 200 -X DELETE $API/utenti/token-inviti/$TOKID -H "Authorization: Bearer $UT"
eq "la riga resta come storico, in stato revocato" "revocato" \
  "$(psql_q -c "SELECT stato FROM token_inviti WHERE id=$TOKID;")"
assert_http "revocare due volte -> 409" 409 -X DELETE $API/utenti/token-inviti/$TOKID -H "Authorization: Bearer $UT"
assert_http "token revocato presentato dal commercialista -> 400" 400 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"token\":\"$TOK\"}"
assert_contiene "il motivo del rifiuto e' la revoca" "revocato"

assert_http "dopo la revoca se ne puo' generare un altro" 200 \
  -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
TOK2=$(cat /tmp/w2body | j "['token']")

echo
echo "=== C. consumo del token ==="
assert_http "token inesistente -> 400" 400 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"token":"0000000000000000000000000000000000000000000000000000000000000000"}'
assert_contiene "il motivo e' token non valido" "non valido"

assert_http "token valido -> richiesta in attesa" 200 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"token\":\"$TOK2\"}"
eq "stato del collegamento" "in_attesa" "$(cat /tmp/w2body | j "['stato']")"
assert_http "lo stesso token una seconda volta -> 400" 400 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"token\":\"$TOK2\"}"
assert_contiene "il motivo e' token gia' utilizzato" "utilizzato"

# Token scaduto: si forza la scadenza sulla riga, senza aspettare sette giorni.
assert_http "nuovo token per la prova di scadenza" 200 \
  -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
TOK3=$(cat /tmp/w2body | j "['token']")
psql_q -c "UPDATE token_inviti SET scadenza = NOW() - interval '1 day' WHERE user_id=$CLI AND stato='attivo';" >/dev/null
assert_http "token scaduto -> 400" 400 \
  -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"token\":\"$TOK3\"}"
assert_contiene "il motivo e' la scadenza" "scaduto"

echo
echo "=== D. richiesta diretta: il commercialista nomina il cliente ==="
U2=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w2e$SFX\",\"email\":\"w2e$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
CLI2=$(curl -s $API/auth/profile -H "Authorization: Bearer $U2" | j "['id']")

assert_http "identificativo troppo corto -> 400" 400 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C2" "${JSON[@]}" -d '{"identificativo_cliente":"ab"}'

assert_http "richiesta per username esistente -> 202" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"identificativo_cliente\":\"w2e$SFX\"}"
RISP_ESISTE=$(cat /tmp/w2body)
eq "nasce una richiesta in attesa" "in_attesa" \
  "$(psql_q -c "SELECT stato FROM collegamenti_commercialista WHERE user_id=$CLI2;")"
eq "la richiesta risulta partita dal commercialista" "commercialista" \
  "$(psql_q -c "SELECT richiesto_da FROM collegamenti_commercialista WHERE user_id=$CLI2;")"

assert_http "richiesta per cliente inesistente -> 202" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"identificativo_cliente\":\"nessuno$SFX@nowhere.it\"}"
eq "la risposta e' identica a quella del cliente esistente" "$RISP_ESISTE" "$(cat /tmp/w2body)"
# L'uguaglianza da sola passerebbe anche se entrambe le risposte fossero un errore:
# si verifica anche che sia la risposta giusta.
assert_contiene "e non rivela se il cliente esiste" "Se il cliente esiste"
eq "nessun collegamento nasce per un cliente inesistente" "1" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE commercialista_id = (SELECT id FROM commercialisti WHERE username='w2d$SFX');")"

assert_http "seconda richiesta per email -> 202" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"identificativo_cliente\":\"w2e$SFX@t.it\"}"
eq "non nasce un secondo collegamento aperto" "1" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE user_id=$CLI2;")"

assert_http "in attesa il commercialista non vede i dati" 403 \
  "$API/commercialisti/clienti/$CLI2" -H "Authorization: Bearer $C2"

curl -s $API/commercialisti/richieste -H "Authorization: Bearer $C2" -o /tmp/w2body
eq "il commercialista vede la propria richiesta in attesa" "1" "$(cat /tmp/w2body | j "['totale']")"
curl -s $API/commercialisti/richieste -H "Authorization: Bearer $CT" -o /tmp/w2body
eq "e non vede quelle degli altri studi" "0" \
  "$(python3 -c "
import json;d=json.load(open('/tmp/w2body'))
print(sum(1 for r in d['richieste'] if r['user_id']==$CLI2))")"

COLL2=$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $U2" | j "['collegamenti'][0]['id']")
assert_http "il cliente accetta" 200 \
  -X PUT $API/utenti/collegamenti/$COLL2/accetta -H "Authorization: Bearer $U2" "${JSON[@]}" -d '{}'
assert_http "ora il commercialista vede i dati" 200 \
  "$API/commercialisti/clienti/$CLI2" -H "Authorization: Bearer $C2"
curl -s $API/commercialisti/richieste -H "Authorization: Bearer $C2" -o /tmp/w2body
eq "la richiesta accettata esce dall'elenco delle pendenti" "0" "$(cat /tmp/w2body | j "['totale']")"

echo
echo "=== F. omonimi di sola maiuscola (P0-3) ==="
# `utenti` ha UNIQUE case-sensitive: "Om" e "om" sono due account diversi.
# Risolvere il cliente con lower(...) ORDER BY id LIMIT 1 apriva il collegamento
# sul primo dei due per id, cioe' sull'utente sbagliato.
C3=$(curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"w2f$SFX\",\"email\":\"w2f$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio Tre\"}" | j "['token']")
UMAI=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"Om$SFX\",\"email\":\"Om$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
UMIN=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"om$SFX\",\"email\":\"om$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
ID_MAI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UMAI" | j "['id']")
ID_MIN=$(curl -s $API/auth/profile -H "Authorization: Bearer $UMIN" | j "['id']")
C3_ID=$(psql_q -c "SELECT id FROM commercialisti WHERE username='w2f$SFX';")
echo "  Om=$ID_MAI  om=$ID_MIN  (l'id minore e' $([ "$ID_MAI" -lt "$ID_MIN" ] && echo Om || echo om))"

assert_http "richiesta con l'identificativo esatto -> 202" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"identificativo_cliente\":\"om$SFX\"}"
eq "il collegamento nasce sull'utente nominato, non sull'omonimo" "$ID_MIN" \
  "$(psql_q -c "SELECT user_id FROM collegamenti_commercialista WHERE commercialista_id=$C3_ID;")"
eq "e ne nasce uno solo" "1" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE commercialista_id=$C3_ID;")"

# Identificativo che non corrisponde a nessuno in modo esatto e a due in modo
# normalizzato: non si sceglie a caso, e la risposta resta quella di sempre.
assert_http "identificativo ambiguo -> 202 come gli altri" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"identificativo_cliente\":\"OM$SFX\"}"
assert_contiene "e non rivela l'ambiguita'" "Se il cliente esiste"
eq "nessun collegamento nasce da un identificativo ambiguo" "1" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE commercialista_id=$C3_ID;")"

echo
echo "=== G. il token in chiaro non finisce nei log (P0-1) ==="
# usa_token_invito solleva un'eccezione per ogni token rifiutato, e l'helper del
# database stampava i parametri della query: il valore in chiaro restava nei log
# a tempo indeterminato, e l'hash in tabella non proteggeva piu' niente.
if ! leggi_log >/dev/null 2>&1; then
  ko "i log del backend sono leggibili" "BACKEND_LOG o BACKEND_CONTAINER" "nessuno dei due"
else
  UG=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w2g$SFX\",\"email\":\"w2g$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
  TOKG=$(curl -s -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UG" "${JSON[@]}" -d '{}' | j "['token']")
  TOKG_ID=$(psql_q -c "SELECT id FROM token_inviti WHERE token_hash = encode(sha256(convert_to('$TOKG','UTF8')),'hex');")
  eq "il token di prova e' stato generato" "64" "${#TOKG}"

  curl -s -X DELETE $API/utenti/token-inviti/$TOKG_ID -H "Authorization: Bearer $UG" >/dev/null
  assert_http "token revocato ripresentato -> 400" 400 \
    -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"token\":\"$TOKG\"}"
  eq "il valore in chiaro non compare nei log" "0" "$(leggi_log | grep -cF "$TOKG" || true)"

  # Stesso controllo sull'altro ramo d'errore: token che non esiste affatto.
  TOKX=$(python3 -c "import secrets;print(secrets.token_hex(32))")
  assert_http "token inesistente -> 400" 400 \
    -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"token\":\"$TOKX\"}"
  eq "nemmeno un token sconosciuto viene stampato" "0" "$(leggi_log | grep -cF "$TOKX" || true)"

  # Ramo Joi: un token malformato (63 caratteri) viene respinto dalla validazione
  # prima di arrivare al database. Il middleware stampava il valore rifiutato.
  TOKM=$(python3 -c "import secrets;print(secrets.token_hex(32)[:63])")
  assert_http "token malformato -> 400" 400 \
    -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"token\":\"$TOKM\"}"
  eq "il token malformato non compare nei log" "0" "$(leggi_log | grep -cF "$TOKM" || true)"

  # Stessa cosa con un valore non esadecimale: Joi respinge per altra regola.
  TOKN="zz$(python3 -c "import secrets;print(secrets.token_hex(31))")"
  assert_http "token non esadecimale -> 400" 400 \
    -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"token\":\"$TOKN\"}"
  eq "il token non esadecimale non compare nei log" "0" "$(leggi_log | grep -cF "$TOKN" || true)"

  # Corpo JSON rotto (token senza virgolette). Da Node 20 il messaggio di
  # JSON.parse riporta un estratto del corpo: si cercano i primi 8 caratteri.
  TOKJ=$(python3 -c "import secrets;print(secrets.token_hex(32))")
  assert_http "corpo JSON malformato -> 400, non 500" 400 \
    -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $C3" "${JSON[@]}" -d "{\"token\":$TOKJ}"
  eq "nemmeno un estratto del corpo malformato finisce nei log" "0" "$(leggi_log | grep -cF "${TOKJ:0:8}" || true)"
fi

echo
echo "=== H. un guasto non viene confermato come richiesta inviata ==="
# 202 uniforme vale per gli esiti di dominio (cliente esistente, inesistente,
# ambiguo, gia' collegato). Un'eccezione del database significa richiesta NON
# salvata: rispondere success:true la confermerebbe al commercialista.
C4=$(curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"w2h$SFX\",\"email\":\"w2h$SFX@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio H\"}" | j "['token']")
UH=$(curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"w2hu$SFX\",\"email\":\"w2hu$SFX@t.it\",\"password\":\"Password123!\"}" | j "['token']")
UH_ID=$(curl -s $API/auth/profile -H "Authorization: Bearer $UH" | j "['id']")

psql_q -c "ALTER FUNCTION richiedi_collegamento(integer, varchar) RENAME TO richiedi_collegamento_guasta;" >/dev/null
assert_http "funzione assente -> 500" 500 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C4" "${JSON[@]}" -d "{\"identificativo_cliente\":\"w2hu$SFX\"}"
eq "la risposta al guasto non dichiara successo" "-" "$(cat /tmp/w2body | j "['success']")"
eq "e in effetti nessuna richiesta e' stata salvata" "0" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE user_id=$UH_ID;")"
psql_q -c "ALTER FUNCTION richiedi_collegamento_guasta(integer, varchar) RENAME TO richiedi_collegamento;" >/dev/null

assert_http "ripristinata la funzione, la stessa richiesta -> 202" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C4" "${JSON[@]}" -d "{\"identificativo_cliente\":\"w2hu$SFX\"}"
eq "ora la richiesta c'e'" "1" \
  "$(psql_q -c "SELECT count(*) FROM collegamenti_commercialista WHERE user_id=$UH_ID AND stato='in_attesa';")"

echo
echo "=== E. il tetto sulle richieste ==="
# 10 all'ora per commercialista. C2 ne ha gia' consumate 4: se ne mandano altre
# finche' non scatta il 429. Ultimo blocco della suite, consuma il budget.
CODICI=""
for i in $(seq 1 9); do
  CODICI="$CODICI $(hit -X POST $API/commercialisti/richieste -H "Authorization: Bearer $C2" "${JSON[@]}" -d "{\"identificativo_cliente\":\"ignoto-$i-$SFX\"}")"
done
case "$CODICI" in
  *429*) ok "il tetto per commercialista scatta" ;;
  *) ko "il tetto per commercialista scatta" "un 429 fra le risposte" "$CODICI" ;;
esac
assert_http "un altro commercialista non e' toccato dal tetto altrui" 202 \
  -X POST $API/commercialisti/richieste -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"identificativo_cliente\":\"ignoto-x-$SFX\"}"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
