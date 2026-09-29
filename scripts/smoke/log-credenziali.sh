#!/usr/bin/env bash
# Smoke test: nessuna credenziale in chiaro nei log del backend.
#
# Ogni route che riceve una password viene chiamata con una password SENTINELLA,
# unica per corsa, sia nel caso valido sia nei rami d'errore (validazione Joi,
# credenziali sbagliate, JSON malformato). Poi si cercano le sentinelle nei log.
#
# Lo script legge i log VERI e fallisce se non gli si dice dove sono: una prova
# sui log che non legge i log passerebbe sempre.
#
#   API=http://localhost:3010/api BACKEND_LOG=/tmp/backend.log ./scripts/smoke/log-credenziali.sh
#   API=... BACKEND_CONTAINER=prima_nota_backend ./scripts/smoke/log-credenziali.sh
#
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
BACKEND_LOG="${BACKEND_LOG:-}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-}"
SFX="${SFX:-$(date +%s)$RANDOM}"

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
hit() { curl -s -o /tmp/logcred-body -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")

# assert_risponde <descrizione> <curl args...>: la route risponde, e non con un 500.
assert_risponde() {
  local desc="$1"; shift
  local got; got=$(hit "$@")
  case "$got" in
    2??|4??) ok "$desc -> HTTP $got" ;;
    *) ko "$desc" "2xx o 4xx" "HTTP $got — $(head -c 160 /tmp/logcred-body)" ;;
  esac
}

echo "=== 0. i log sono leggibili ==="
if ! leggi_log >/dev/null 2>&1; then
  ko "i log del backend sono leggibili" "BACKEND_LOG o BACKEND_CONTAINER" "nessuno dei due"
  echo; echo "================================================"
  printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"; exit 1
fi
ok "i log del backend sono leggibili"

# Sentinelle: lettere, cifre e simboli ammessi dagli schemi Joi.
PW_U="SentU${SFX}Xq!"        # password dell'utente
PW_N="SentN${SFX}Zk!"        # nuova password nel cambio
PW_C="SentC${SFX}Wm!"        # password del commercialista
PW_BAD="SentB${SFX}Yr!"      # password sbagliata presentata apposta

echo
echo "=== A. utente ==="
assert_risponde "registrazione valida" \
  -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"lc$SFX\",\"email\":\"lc$SFX@t.it\",\"password\":\"$PW_U\"}"
UT=$(j "['token']" < /tmp/logcred-body)
assert_risponde "registrazione respinta dalla validazione" \
  -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"x\",\"email\":\"non-una-email\",\"password\":\"$PW_U\"}"
assert_risponde "login con password giusta" \
  -X POST $API/auth/login "${JSON[@]}" -d "{\"username\":\"lc$SFX\",\"password\":\"$PW_U\"}"
eq "il login giusto riesce davvero" "200" "$(hit -X POST $API/auth/login "${JSON[@]}" -d "{\"username\":\"lc$SFX\",\"password\":\"$PW_U\"}")"
assert_risponde "login con password sbagliata" \
  -X POST $API/auth/login "${JSON[@]}" -d "{\"username\":\"lc$SFX\",\"password\":\"$PW_BAD\"}"
assert_risponde "login respinto dalla validazione" \
  -X POST $API/auth/login "${JSON[@]}" -d "{\"password\":\"$PW_BAD\"}"
assert_risponde "cambio password con password corrente sbagliata" \
  -X POST $API/auth/change-password -H "Authorization: Bearer $UT" "${JSON[@]}" -d "{\"currentPassword\":\"$PW_BAD\",\"newPassword\":\"$PW_N\"}"
assert_risponde "eliminazione account con password sbagliata" \
  -X DELETE $API/auth/account -H "Authorization: Bearer $UT" "${JSON[@]}" -d "{\"password\":\"$PW_BAD\"}"
assert_risponde "login con corpo JSON malformato" \
  -X POST $API/auth/login "${JSON[@]}" -d "{\"username\":\"lc$SFX\",\"password\":$PW_BAD}"

echo
echo "=== B. commercialista ==="
assert_risponde "registrazione commercialista" \
  -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"lcc$SFX\",\"email\":\"lcc$SFX@t.it\",\"password\":\"$PW_C\",\"ragione_sociale\":\"Studio LC\"}"
assert_risponde "login commercialista con password giusta" \
  -X POST $API/commercialisti/login "${JSON[@]}" -d "{\"username\":\"lcc$SFX\",\"password\":\"$PW_C\"}"
assert_risponde "login commercialista con password sbagliata" \
  -X POST $API/commercialisti/login "${JSON[@]}" -d "{\"username\":\"lcc$SFX\",\"password\":\"$PW_BAD\"}"

echo
echo "=== C. nessuna sentinella nei log ==="
# Controllo che il log contenga davvero il traffico di questa corsa: senza, la
# ricerca delle sentinelle non dimostrerebbe niente.
RIGHE=$(leggi_log | grep -cE "POST /api/(auth|commercialisti)/login" || true)
if [ "${RIGHE:-0}" -gt 0 ]; then ok "il log registra le richieste di login ($RIGHE righe)"
else ko "il log registra le richieste di login" ">0 righe" "0"; fi

for coppia in "password utente:$PW_U" "nuova password:$PW_N" "password commercialista:$PW_C" "password sbagliata:$PW_BAD"; do
  nome="${coppia%%:*}"; val="${coppia#*:}"
  eq "la $nome non compare nei log" "0" "$(leggi_log | grep -cF "$val" || true)"
done
# Anche un estratto: il messaggio d'errore del parser JSON cita i primi caratteri.
eq "nessun estratto della password sbagliata nei log" "0" "$(leggi_log | grep -cF "SentB${SFX}" || true)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
