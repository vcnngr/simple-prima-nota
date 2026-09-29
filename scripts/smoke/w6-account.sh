#!/usr/bin/env bash
# Smoke test dell'account (blocco W6, migration 008): cambio password, reset via
# email, cambio email con conferma. Per utenti e commercialisti.
#
# Legge le mail davvero consegnate a mailpit e ne estrae i link. Verifica:
#   * cambio password: chiude le altre sessioni, restituisce un token per questa;
#   * reset: risposta identica per account esistente o no; link monouso, a scadenza,
#     spento da un cambio password e da un reset successivo; dieci consumi
#     simultanei dello stesso link -> uno solo riesce;
#   * token di un tipo di account inutilizzabile per l'altro tipo e per l'altro scopo;
#   * cambio email: vale solo dopo la conferma dal nuovo indirizzo; avviso al vecchio;
#     un reset chiesto prima del cambio non vale piu' dopo;
#   * nel database solo hash; nei log niente token, password o indirizzi;
#   * tetto per IP sulle richieste di reset;
#   * gare: cambio email contro cambio password, conferme di indirizzi uguali a
#     meno delle maiuscole; unicita' di lower(email) nel database.
#
# Il backend deve girare con SMTP verso mailpit e attesa breve fra due mail:
#   SMTP_HOST=127.0.0.1 SMTP_PORT=<smtp> ACCOUNT_MAIL_ATTESA_SEC=3 RESET_PASSWORD_LIMITE=20 \
#   JWT_SECRET=<segreto> node server.js > /tmp/pn-w6-backend.log
#
#   API=http://localhost:3060/api DB_CONTAINER=pn-w6-db MAIL_API=http://localhost:55462 \
#   BACKEND_LOG=/tmp/pn-w6-backend.log JWT_SECRET=<segreto> RESET_LIMITE=20 ./scripts/smoke/w6-account.sh
#
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
MAIL_API="${MAIL_API:-http://localhost:8025}"
BACKEND_LOG="${BACKEND_LOG:-}"
JWT_SECRET="${JWT_SECRET:-}"
RESET_LIMITE="${RESET_LIMITE:-20}"
ATTESA="${ATTESA:-3}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
BODY=/tmp/w6body.$$
hit() { curl -s --max-time 10 -o $BODY -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"; else ko "$desc" "HTTP $atteso" "HTTP $got — $(head -c 200 $BODY)"; fi
}
# Ogni richiesta di reset parla da un "IP" suo, cosi' il tetto per IP si prova solo in K.
N_IP=0

mail_a() {  # mail_a <indirizzo> [oggetto contiene]
  curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower(); sub='''${2:-}'''
print(sum(1 for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[])) and sub in m.get('Subject','')))" 2>/dev/null || echo "-"
}
# Token dall'ultima mail all'indirizzo con quell'oggetto.
token_da_mail() {
  local id; id=$(curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower(); sub='''$2'''
ms=[m for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[])) and sub in m.get('Subject','')]
print(ms[0]['ID'] if ms else '')" 2>/dev/null)
  [ -n "$id" ] || { echo ""; return; }
  curl -s --max-time 5 "$MAIL_API/api/v1/message/$id" | python3 -c "
import sys,json,re
t=json.load(sys.stdin).get('Text','')
m=re.search(r'#token=([0-9a-f]{64})', t); print(m.group(1) if m else '')"
}
link_da_mail() {
  local id; id=$(curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower(); sub='''$2'''
ms=[m for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[])) and sub in m.get('Subject','')]
print(ms[0]['ID'] if ms else '')" 2>/dev/null)
  curl -s --max-time 5 "$MAIL_API/api/v1/message/$id" | python3 -c "
import sys,json,re
t=json.load(sys.stdin).get('Text','')
m=re.search(r'(https?://\S+)#token=', t); print(m.group(1) if m else '')"
}
attendi() {
  local atteso="$1"; shift
  local v
  for _ in $(seq 1 30); do v=$("$@"); [ "$v" = "$atteso" ] && { echo "$v"; return; }; sleep 0.5; done
  echo "$v"
}

# --- per tipo di account ------------------------------------------------------
# user: /auth, cambio password POST /auth/change-password
# commercialista: /commercialisti, cambio password PUT /commercialisti/password
imposta_tipo() {
  TIPO="$1"
  if [ "$TIPO" = user ]; then
    BASE="$API/auth"; CAMBIO=(-X POST "$API/auth/change-password"); PROFILO="$API/auth/profile"
    COL=user_id; TAB=utenti; ALTRO_BASE="$API/commercialisti"; PERCORSO=""
  else
    BASE="$API/commercialisti"; CAMBIO=(-X PUT "$API/commercialisti/password"); PROFILO="$API/commercialisti/profile"
    COL=commercialista_id; TAB=commercialisti; ALTRO_BASE="$API/auth"; PERCORSO="/commercialista"
  fi
}
registra() {  # registra <username> -> token
  if [ "$TIPO" = user ]; then
    curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | j "['token']"
  else
    curl -s -X POST $API/commercialisti/register "${JSON[@]}" \
      -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio $1\"}" | j "['token']"
  fi
}
login() {  # login <username> <password> -> http code (token in $BODY)
  hit -X POST "$BASE/login" "${JSON[@]}" -d "{\"username\":\"$1\",\"password\":\"$2\"}"
}
profilo() { hit "$PROFILO" -H "Authorization: Bearer $1"; }
cambia() {  # cambia <token> <attuale> <nuova>
  hit "${CAMBIO[@]}" -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"currentPassword\":\"$2\",\"newPassword\":\"$3\"}"
}
dimenticata() {
  N_IP=$((N_IP + 1))
  hit -X POST "$BASE/password-dimenticata" -H "X-Forwarded-For: 10.6.$((N_IP / 250)).$((N_IP % 250 + 1))" "${JSON[@]}" -d "{\"identificativo\":\"$1\"}"
}
reimposta() { hit -X POST "$BASE/password-reimposta" "${JSON[@]}" -d "{\"token\":\"$1\",\"password\":\"$2\"}"; }
id_account() { psql_q -c "SELECT id FROM $TAB WHERE username='$1';"; }
token_attivi() { psql_q -c "SELECT count(*) FROM token_account WHERE $COL=$1 AND scopo='$2' AND usato_il IS NULL AND annullato_il IS NULL;"; }

TOKENS_VISTI=""
ricorda() { TOKENS_VISTI="$TOKENS_VISTI $1"; }

ciclo() {
  imposta_tipo "$1"
  local P="w6${1:0:1}$SFX"      # prefisso username per tipo
  echo
  echo "################ $TIPO ################"

  echo "=== A. setup ==="
  local U="${P}a"
  local T1; T1=$(registra "$U"); local T2
  login "$U" "$PW" >/dev/null; T2=$(j "['token']" < $BODY)
  eq "due sessioni aperte" "200|200" "$(profilo "$T1")|$(profilo "$T2")"
  local ID; ID=$(id_account "$U")
  eq "versione credenziali iniziale 0" "0" "$(psql_q -c "SELECT versione_credenziali FROM $TAB WHERE id=$ID;")"
  if [ -n "$JWT_SECRET" ]; then
    local VECCHIO; VECCHIO=$(cd "$(dirname "$0")/../../backend" && JWT_SECRET="$JWT_SECRET" node -e "
const p={id:$ID,username:'$U'}; if('$TIPO'==='commercialista') p.tipo='commercialista';
console.log(require('jsonwebtoken').sign(p, process.env.JWT_SECRET, {expiresIn:'1h'}))")
    eq "token anteriore alla 008 (senza cv) vale a versione 0" "200" "$(profilo "$VECCHIO")"
  else
    ko "token senza cv" "JWT_SECRET impostato" "assente"
  fi

  echo "=== B. cambio password ==="
  eq "password attuale sbagliata -> 400" "400" "$(cambia "$T1" "sbagliata" "NuovaPass456!")"
  eq "nuova troppo corta -> 400" "400" "$(cambia "$T1" "$PW" "corta")"
  eq "nuova oltre 72 byte -> 400" "400" "$(cambia "$T1" "$PW" "$(printf 'è%.0s' $(seq 1 37))")"
  eq "senza token -> 401" "401" "$(hit "${CAMBIO[@]}" "${JSON[@]}" -d "{\"currentPassword\":\"$PW\",\"newPassword\":\"NuovaPass456!\"}")"
  eq "cambio -> 200" "200" "$(cambia "$T1" "$PW" "NuovaPass456!")"
  local T3; T3=$(j "['token']" < $BODY)
  eq "la risposta porta un token nuovo" "1" "$([ -n "$T3" ] && [ "$T3" != "-" ] && [ "$T3" != "$T1" ] && echo 1 || echo 0)"
  eq "sessione che ha cambiato (vecchio token) -> 401" "401" "$(profilo "$T1")"
  eq "altra sessione -> 401" "401" "$(profilo "$T2")"
  [ -n "${VECCHIO:-}" ] && eq "token senza cv -> 401 dopo il cambio" "401" "$(profilo "$VECCHIO")"
  eq "token nuovo -> 200" "200" "$(profilo "$T3")"
  eq "login con la vecchia password rifiutato" "1" "$(c=$(login "$U" "$PW"); [ "$c" = 400 ] || [ "$c" = 401 ] && echo 1 || echo "$c")"
  eq "login con la nuova -> 200" "200" "$(login "$U" "NuovaPass456!")"
  eq "avviso di cambio al titolare" "1" "$(attendi 1 mail_a "$U@t.it" "e' stata cambiata")"
  eq "hash nuovo e' bcrypt" "1" "$(psql_q -c "SELECT (password_hash LIKE '\$2%')::int FROM $TAB WHERE id=$ID;")"

  echo "=== C. reset: nessuna differenza fra account esistente e no ==="
  local UR="${P}r"; registra "$UR" >/dev/null
  local IDR; IDR=$(id_account "$UR")
  local C1 B1 C2 B2
  C1=$(dimenticata "$UR"); B1=$(cat $BODY)
  C2=$(dimenticata "nessuno$SFX$TIPO"); B2=$(cat $BODY)
  eq "account esistente -> 202" "202" "$C1"
  eq "account inesistente -> 202" "202" "$C2"
  eq "stesso corpo di risposta" "$B1" "$B2"
  eq "la mail arriva" "1" "$(attendi 1 mail_a "$UR@t.it" "Reimposta la password")"
  local TK; TK=$(token_da_mail "$UR@t.it" "Reimposta la password"); ricorda "$TK"
  eq "la mail porta un token di 64 esadecimali" "64" "${#TK}"
  eq "il link punta alla pagina giusta" "http://app.test$PERCORSO/reimposta-password" "$(link_da_mail "$UR@t.it" "Reimposta la password")"
  eq "nel DB solo l'hash" "0|1" "$(psql_q -c "SELECT count(*) FILTER (WHERE token_hash='$TK')||'|'||count(*) FILTER (WHERE token_hash=encode(sha256('$TK'::bytea),'hex')) FROM token_account;")"
  dimenticata "$UR" >/dev/null
  dimenticata "$UR@T.IT" >/dev/null
  sleep 1
  eq "richieste ravvicinate (anche per email maiuscola): nessuna seconda mail" "1" "$(mail_a "$UR@t.it" "Reimposta la password")"
  eq "un solo token attivo" "1" "$(token_attivi $IDR reset_password)"

  echo "=== D. reset: uso del link ==="
  eq "token malformato -> 400" "400" "$(reimposta "abc" "Reimpostata789!")"
  eq "token inventato -> 400" "400" "$(reimposta "$(printf '%064d' 0)" "Reimpostata789!")"
  eq "password troppo corta -> 400" "400" "$(reimposta "$TK" "corta")"
  eq "il 400 per password corta non consuma il link" "1" "$(token_attivi $IDR reset_password)"
  eq "link dell'altro tipo di account -> 400" "400" \
    "$(hit -X POST "$ALTRO_BASE/password-reimposta" "${JSON[@]}" -d "{\"token\":\"$TK\",\"password\":\"Reimpostata789!\"}")"
  eq "link di reset usato come conferma email -> 400" "400" \
    "$(hit -X POST "$BASE/email/conferma" "${JSON[@]}" -d "{\"token\":\"$TK\"}")"
  login "$UR" "$PW" >/dev/null; local TR; TR=$(j "['token']" < $BODY)
  eq "link valido -> 200" "200" "$(reimposta "$TK" "Reimpostata789!")"
  eq "lo stesso link una seconda volta -> 400" "400" "$(reimposta "$TK" "Altra000000!")"
  eq "la sessione aperta prima del reset -> 401" "401" "$(profilo "$TR")"
  eq "login con la password reimpostata -> 200" "200" "$(login "$UR" "Reimpostata789!")"
  eq "avviso di reset al titolare" "1" "$(attendi 1 mail_a "$UR@t.it" "reimpostata")"

  echo "=== E. reset: scadenza, cambio password, nuova richiesta ==="
  sleep $((ATTESA + 1))
  dimenticata "$UR" >/dev/null
  eq "nuova mail dopo l'attesa" "2" "$(attendi 2 mail_a "$UR@t.it" "Reimposta la password")"
  local TK2; TK2=$(token_da_mail "$UR@t.it" "Reimposta la password"); ricorda "$TK2"
  psql_q -c "UPDATE token_account SET scadenza = NOW() - interval '1 second' WHERE token_hash=encode(sha256('$TK2'::bytea),'hex');" >/dev/null
  eq "link scaduto -> 400" "400" "$(reimposta "$TK2" "Scaduta00000!")"

  sleep $((ATTESA + 1))
  dimenticata "$UR" >/dev/null
  attendi 3 mail_a "$UR@t.it" "Reimposta la password" >/dev/null
  local TK3; TK3=$(token_da_mail "$UR@t.it" "Reimposta la password"); ricorda "$TK3"
  login "$UR" "Reimpostata789!" >/dev/null; local TR2; TR2=$(j "['token']" < $BODY)
  eq "cambio password da loggato" "200" "$(cambia "$TR2" "Reimpostata789!" "DaLoggato111!")"
  eq "il link chiesto prima del cambio -> 400" "400" "$(reimposta "$TK3" "Dopo0000000!")"

  sleep $((ATTESA + 1))
  dimenticata "$UR" >/dev/null
  attendi 4 mail_a "$UR@t.it" "Reimposta la password" >/dev/null
  local TK4; TK4=$(token_da_mail "$UR@t.it" "Reimposta la password"); ricorda "$TK4"
  sleep $((ATTESA + 1))
  dimenticata "$UR" >/dev/null
  attendi 5 mail_a "$UR@t.it" "Reimposta la password" >/dev/null
  local TK5; TK5=$(token_da_mail "$UR@t.it" "Reimposta la password"); ricorda "$TK5"
  eq "richiesta successiva: il link precedente -> 400" "400" "$(reimposta "$TK4" "Precedente0!")"

  echo "=== F. reset: dieci consumi simultanei dello stesso link ==="
  local cod
  cod=$(for i in $(seq 1 10); do
    curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 -X POST "$BASE/password-reimposta" "${JSON[@]}" \
      -d "{\"token\":\"$TK5\",\"password\":\"Concorrente$i!x\"}" &
  done; wait)
  eq "un solo 200" "1" "$(echo "$cod" | grep -c '^200$')"
  eq "nove 400" "9" "$(echo "$cod" | grep -c '^400$')"
  eq "versione incrementata una volta sola per quel reset" "1" \
    "$(psql_q -c "SELECT count(*) FROM token_account WHERE token_hash=encode(sha256('$TK5'::bytea),'hex') AND usato_il IS NOT NULL;")"
  local vinc=0
  for i in $(seq 1 10); do [ "$(login "$UR" "Concorrente$i!x")" = 200 ] && vinc=$((vinc+1)); done
  eq "una sola delle dieci password funziona" "1" "$vinc"

  echo "=== G. cambio email ==="
  local UE="${P}e"; local TE; TE=$(registra "$UE"); local IDE; IDE=$(id_account "$UE")
  local ALTRA="${P}x"; registra "$ALTRA" >/dev/null
  local NUOVA="nuova.${P}@t.it"
  cambia_email() { hit -X POST "$BASE/email" -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"password\":\"$2\",\"email\":\"$3\"}"; }
  conferma() { hit -X POST "$BASE/email/conferma" "${JSON[@]}" -d "{\"token\":\"$1\"}"; }
  email_attuale() { psql_q -c "SELECT email FROM $TAB WHERE id=$IDE;"; }
  eq "password sbagliata -> 400" "400" "$(cambia_email "$TE" "sbagliata" "$NUOVA")"
  eq "stesso indirizzo -> 400" "400" "$(cambia_email "$TE" "$PW" "$UE@T.it")"
  eq "indirizzo di un altro account -> 409" "409" "$(cambia_email "$TE" "$PW" "$ALTRA@t.it")"
  eq "email non valida -> 400" "400" "$(cambia_email "$TE" "$PW" "non-una-email")"
  eq "senza token -> 401" "401" "$(hit -X POST "$BASE/email" "${JSON[@]}" -d "{\"password\":\"$PW\",\"email\":\"$NUOVA\"}")"

  # Un reset chiesto prima del cambio: dopo la conferma non deve valere piu'.
  dimenticata "$UE" >/dev/null
  attendi 1 mail_a "$UE@t.it" "Reimposta la password" >/dev/null
  local TKE; TKE=$(token_da_mail "$UE@t.it" "Reimposta la password"); ricorda "$TKE"

  eq "richiesta di cambio -> 202" "202" "$(cambia_email "$TE" "$PW" "$NUOVA")"
  eq "prima della conferma l'indirizzo non cambia" "$UE@t.it" "$(email_attuale)"
  eq "la mail va al nuovo indirizzo" "1" "$(attendi 1 mail_a "$NUOVA" "Conferma il nuovo indirizzo")"
  local TC; TC=$(token_da_mail "$NUOVA" "Conferma il nuovo indirizzo"); ricorda "$TC"
  eq "il link punta alla pagina giusta" "http://app.test$PERCORSO/conferma-email" "$(link_da_mail "$NUOVA" "Conferma il nuovo indirizzo")"
  eq "link di conferma usato come reset -> 400" "400" "$(reimposta "$TC" "Furbo0000000!")"
  eq "link dell'altro tipo di account -> 400" "400" \
    "$(hit -X POST "$ALTRO_BASE/email/conferma" "${JSON[@]}" -d "{\"token\":\"$TC\"}")"
  eq "conferma -> 200" "200" "$(conferma "$TC")"
  eq "l'indirizzo e' cambiato" "$NUOVA" "$(email_attuale)"
  eq "lo stesso link di nuovo -> 400" "400" "$(conferma "$TC")"
  eq "avviso al vecchio indirizzo" "1" "$(attendi 1 mail_a "$UE@t.it" "e' cambiato")"
  eq "la sessione resta valida (l'email non e' una credenziale)" "200" "$(profilo "$TE")"
  eq "il reset chiesto prima del cambio -> 400" "400" "$(reimposta "$TKE" "Vecchio00000!")"
  eq "il reset ora va al nuovo indirizzo" "202" "$(dimenticata "$NUOVA")"
  eq "mail di reset al nuovo indirizzo" "1" "$(attendi 1 mail_a "$NUOVA" "Reimposta la password")"

  echo "=== H. cambio email: due account per lo stesso indirizzo ==="
  local UA="${P}p" UB="${P}q" CONTESO="conteso.${P}@t.it"
  local TA TB; TA=$(registra "$UA"); TB=$(registra "$UB")
  cambia_email "$TA" "$PW" "$CONTESO" >/dev/null
  attendi 1 mail_a "$CONTESO" "Conferma" >/dev/null
  local CA; CA=$(token_da_mail "$CONTESO" "Conferma"); ricorda "$CA"
  cambia_email "$TB" "$PW" "$CONTESO" >/dev/null
  attendi 2 mail_a "$CONTESO" "Conferma" >/dev/null
  local CB; CB=$(token_da_mail "$CONTESO" "Conferma"); ricorda "$CB"
  eq "due link diversi" "1" "$([ -n "$CA" ] && [ "$CA" != "$CB" ] && echo 1 || echo 0)"
  eq "il primo conferma -> 200" "200" "$(conferma "$CA")"
  eq "il secondo -> 409" "409" "$(conferma "$CB")"
  eq "l'indirizzo e' di uno solo" "1" "$(psql_q -c "SELECT count(*) FROM $TAB WHERE lower(email)=lower('$CONTESO');")"

  echo "=== I. l'account cancellato porta via i suoi token ==="
  if [ "$TIPO" = user ]; then
    local UD="${P}d"; local TD; TD=$(registra "$UD"); local IDD; IDD=$(id_account "$UD")
    dimenticata "$UD" >/dev/null; attendi 1 mail_a "$UD@t.it" "Reimposta" >/dev/null
    eq "token presente" "1" "$(psql_q -c "SELECT count(*) FROM token_account WHERE user_id=$IDD;")"
    hit -X DELETE "$API/auth/account" -H "Authorization: Bearer $TD" "${JSON[@]}" -d "{\"password\":\"$PW\"}" >/dev/null
    eq "dopo la cancellazione: nessun token" "0" "$(psql_q -c "SELECT count(*) FROM token_account WHERE user_id=$IDD;")"
  else
    local IDC; IDC=$(id_account "$UA")
    psql_q -c "DELETE FROM commercialisti WHERE id=$IDC;" >/dev/null
    eq "dopo la cancellazione: nessun token" "0" "$(psql_q -c "SELECT count(*) FROM token_account WHERE commercialista_id=$IDC;")"
  fi
}

echo "=== setup (suffisso $SFX) ==="
eq "mailpit risponde" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$MAIL_API/api/v1/messages")"
eq "migration 008 applicata" "1" "$(psql_q -c "SELECT count(*) FROM information_schema.tables WHERE table_name='token_account';")"

ciclo user
ciclo commercialista

echo
echo "=== J. profilo del commercialista ==="
imposta_tipo commercialista
TP=$(registra "w6p$SFX")
assert_http "aggiorna ragione sociale e telefono" 200 -X PUT "$API/commercialisti/profile" -H "Authorization: Bearer $TP" "${JSON[@]}" \
  -d '{"ragione_sociale":"Studio Nuovo","telefono":"+39 06 1234567","partita_iva":"12345678901"}'
eq "salvati" "Studio Nuovo|+39 06 1234567|12345678901" \
  "$(psql_q -c "SELECT ragione_sociale||'|'||telefono||'|'||partita_iva FROM commercialisti WHERE username='w6p$SFX';")"
assert_http "partita IVA di 10 cifre -> 400" 400 -X PUT "$API/commercialisti/profile" -H "Authorization: Bearer $TP" "${JSON[@]}" -d '{"partita_iva":"1234567890"}'
assert_http "l'email non si cambia da qui (campo ignorato, nulla da aggiornare) -> 400" 400 \
  -X PUT "$API/commercialisti/profile" -H "Authorization: Bearer $TP" "${JSON[@]}" -d '{"email":"x@t.it"}'
eq "email invariata" "w6p$SFX@t.it" "$(psql_q -c "SELECT email FROM commercialisti WHERE username='w6p$SFX';")"
imposta_tipo user
TU=$(registra "w6pu$SFX")
assert_http "token utente sul profilo commercialista -> 401" 401 -X PUT "$API/commercialisti/profile" -H "Authorization: Bearer $TU" "${JSON[@]}" -d '{"telefono":"1"}'
assert_http "token utente sul cambio password commercialista -> 401" 401 -X PUT "$API/commercialisti/password" -H "Authorization: Bearer $TU" "${JSON[@]}" \
  -d "{\"currentPassword\":\"$PW\",\"newPassword\":\"Qualunque123!\"}"

echo
echo "=== K. tetto per IP sulle richieste di reset ==="
n429=0; primo=0
for i in $(seq 1 $((RESET_LIMITE + 2))); do
  c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/password-dimenticata" -H "X-Forwarded-For: 10.6.9.9" "${JSON[@]}" -d "{\"identificativo\":\"nessuno$i$SFX\"}")
  if [ "$c" = 429 ]; then n429=$((n429+1)); [ $primo = 0 ] && primo=$i; fi
done
eq "la richiesta $((RESET_LIMITE + 1)) e' la prima rifiutata" "$((RESET_LIMITE + 1))" "$primo"
eq "e anche le successive" "2" "$n429"

echo
echo "=== M. gare (revisione W6) ==="
# M1: la richiesta di cambio email verifica la vecchia password, poi aspetta il
# lock dell'account mentre un cambio password (simulato in SQL, lock tenuto 3 s)
# si chiude. Dopo il lock la password non e' piu' quella: niente token.
# M2: due conferme concorrenti di indirizzi uguali a meno delle maiuscole, con
# l'UPDATE dell'email rallentato da un trigger di prova: una sola vince.
NUOVO_HASH=$(cd "$(dirname "$0")/../../backend" && node -e "require('bcryptjs').hash('CambiataDalTitolare1!',10).then(h=>console.log(h))")
gare() {
  imposta_tipo "$1"
  local P="w6m${1:0:1}$SFX"
  local UV="${P}v"; local TV; TV=$(registra "$UV"); local IDV; IDV=$(id_account "$UV")
  local LADRO="ladro.${P}@t.it"
  docker exec -i "$DB_CONTAINER" psql -q -U postgres -d "$DB_NAME" -c \
    "BEGIN; UPDATE $TAB SET password_hash='$NUOVO_HASH', versione_credenziali=versione_credenziali+1 WHERE id=$IDV; SELECT pg_sleep(3); COMMIT;" >/dev/null &
  local LOCKER=$!
  sleep 0.7
  local c; c=$(hit -X POST "$BASE/email" -H "Authorization: Bearer $TV" "${JSON[@]}" -d "{\"password\":\"$PW\",\"email\":\"$LADRO\"}")
  wait $LOCKER
  eq "[$TIPO] cambio email con la password appena cambiata -> 400" "400" "$c"
  eq "[$TIPO] nessun token di conferma emesso" "0" "$(psql_q -c "SELECT count(*) FROM token_account WHERE $COL=$IDV AND scopo='conferma_email';")"
  sleep 1
  eq "[$TIPO] nessuna mail all'indirizzo dell'attaccante" "0" "$(mail_a "$LADRO")"
  eq "[$TIPO] email invariata" "$UV@t.it" "$(psql_q -c "SELECT email FROM $TAB WHERE id=$IDV;")"

  local A="${P}a" B="${P}b"; local TA TB; TA=$(registra "$A"); TB=$(registra "$B")
  local SU="Conteso.${P}@t.it" SL="conteso.${P}@t.it"
  hit -X POST "$BASE/email" -H "Authorization: Bearer $TA" "${JSON[@]}" -d "{\"password\":\"$PW\",\"email\":\"$SU\"}" >/dev/null
  hit -X POST "$BASE/email" -H "Authorization: Bearer $TB" "${JSON[@]}" -d "{\"password\":\"$PW\",\"email\":\"$SL\"}" >/dev/null
  attendi 2 mail_a "$SL" "Conferma" >/dev/null   # mail_a non distingue le maiuscole: 2 mail
  local KU
  KU=$(curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json,urllib.request,re
d=json.load(sys.stdin)
for want in ('$SU','$SL'):
    m=next(m for m in d['messages'] if any(a['Address']==want for a in m.get('To',[])) and 'Conferma' in m.get('Subject',''))
    t=json.load(urllib.request.urlopen('$MAIL_API/api/v1/message/'+m['ID']))['Text']
    print(re.search(r'#token=([0-9a-f]{64})',t).group(1))" | paste -sd' ' -)
  set -- $KU
  psql_q -c "CREATE OR REPLACE FUNCTION w6_rallenta() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN PERFORM pg_sleep(2); RETURN NEW; END \$\$;
             CREATE TRIGGER w6_rallenta BEFORE UPDATE OF email ON $TAB FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email) EXECUTE FUNCTION w6_rallenta();" >/dev/null
  curl -s --max-time 15 -o /dev/null -w "%{http_code}\n" -X POST "$BASE/email/conferma" "${JSON[@]}" -d "{\"token\":\"$1\"}" > /tmp/w6m1.$$ &
  curl -s --max-time 15 -o /dev/null -w "%{http_code}\n" -X POST "$BASE/email/conferma" "${JSON[@]}" -d "{\"token\":\"$2\"}" > /tmp/w6m2.$$ &
  wait
  psql_q -c "DROP TRIGGER w6_rallenta ON $TAB; DROP FUNCTION w6_rallenta();" >/dev/null
  eq "[$TIPO] conferme concorrenti Conteso/conteso: una 200, una 409" "200 409" "$(cat /tmp/w6m1.$$ /tmp/w6m2.$$ | sort | paste -sd' ' -)"
  rm -f /tmp/w6m1.$$ /tmp/w6m2.$$
  eq "[$TIPO] un solo account con quell'indirizzo" "1" "$(psql_q -c "SELECT count(*) FROM $TAB WHERE lower(email)=lower('$SL');")"
  local R; R=$(echo "$UV" | tr a-z A-Z)
  eq "[$TIPO] il database rifiuta la variante maiuscola" "23505" \
    "$(psql_q -c "UPDATE $TAB SET email='$R@T.IT' WHERE username='$A';" 2>&1 | grep -oE 'duplicate key|UPDATE 1' | sed 's/duplicate key/23505/' | head -1)"
  if [ "$TIPO" = user ]; then
    assert_http "[$TIPO] registrazione con email che differisce solo per le maiuscole -> 400" 400 \
      -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"${P}r\",\"email\":\"$R@T.IT\",\"password\":\"$PW\"}"
  else
    assert_http "[$TIPO] registrazione con email che differisce solo per le maiuscole -> 400" 400 \
      -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"${P}r\",\"email\":\"$R@T.IT\",\"password\":\"$PW\",\"ragione_sociale\":\"X\"}"
  fi
}
gare user
gare commercialista

echo
echo "=== L. nei log niente token, password o indirizzi ==="
if [ -n "$BACKEND_LOG" ] && [ -f "$BACKEND_LOG" ]; then
  trovati=0
  for t in $TOKENS_VISTI; do grep -qF "$t" "$BACKEND_LOG" && trovati=$((trovati+1)); done
  eq "nessuno dei token dei link" "0" "$trovati"
  eq "nessuna password usata" "0" "$(grep -cE 'NuovaPass456|Reimpostata789|DaLoggato111|Concorrente[0-9]+!x|Password123' "$BACKEND_LOG")"
  eq "nessun indirizzo email dei test" "0" "$(grep -ciE '@t\.it' "$BACKEND_LOG")"
  eq "gli invii sono nel log (tipo, id, esito)" "1" "$([ "$(grep -c 'reset password .*: mail inviata' "$BACKEND_LOG")" -gt 0 ] && echo 1 || echo 0)"
else
  ko "log del backend" "BACKEND_LOG leggibile" "assente"
fi

rm -f $BODY
echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
