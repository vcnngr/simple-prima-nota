#!/usr/bin/env bash
# Smoke test del blocco K1 (sicurezza): il token dice per quale tabella vale.
#
# Utenti e studi hanno due sequenze di id separate. Prima di K1 il middleware
# `auth` delle rotte dell'utente non guardava il tipo del token: lo studio con id N
# (registrazione pubblica) entrava come utente N, backup compreso.
#
# Verifica:
#   A. token di uno studio sulle rotte dell'utente con lo stesso id: 401 ovunque
#      (profilo, movimenti, conti, anagrafiche, dashboard, backup, eliminazione);
#   B. token di un utente sulle rotte dello studio: 401; rotte comuni (authEither):
#      ognuno vede la propria parte;
#   C. token contraffatti con il segreto giusto: tipo sconosciuto, algoritmo diverso
#      da HS256, alg "none": 401; token utente senza tipo (firmati prima di K1): validi;
#   D. i token nuovi portano il tipo;
#   E. registrazione: password di almeno 8 caratteri per utenti e studi; dati dello
#      studio validati (email, username, partita IVA).
#
#   API=http://localhost:3130/api DB_CONTAINER=pn-k1-db JWT_SECRET=<segreto del backend> \
#   ./scripts/smoke/k1-token.sh
#
# JWT_SECRET serve solo a contraffare i token della sezione C.
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
JWT_SECRET="${JWT_SECRET:?JWT_SECRET del backend richiesto}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
j()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")
code() { hit -H "Authorization: Bearer $1" "${@:2}"; }

reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | j "['token']"; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio $1\"}" | j "['token']"; }
payload() { python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];print(json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))$2)" "$1" 2>/dev/null || echo "-"; }
# forgia <json del payload> [algoritmo]: firmato con il segreto del backend
forgia() {
  (cd "$R/backend" && node -e "const jwt=require('jsonwebtoken');process.stdout.write(jwt.sign(JSON.parse(process.argv[1]),process.argv[3],{algorithm:process.argv[2],expiresIn:'1h'}))" "$1" "${2:-HS256}" "$JWT_SECRET")
}
b64u() { printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '=\n'; }

echo "=== setup (suffisso $SFX) ==="
C="k1c$SFX"; CT=$(reg_c "$C"); CID=$(q "SELECT id FROM commercialisti WHERE username='$C'")
# Su un database gia' usato gli id degli utenti possono aver superato quelli
# degli studi: si porta avanti la sequenza degli studi oltre l'ultimo utente.
MAXU=$(q "SELECT coalesce(max(id),0) FROM utenti")
if [ -n "$CID" ] && [ "$CID" -le "$MAXU" ]; then
  q "SELECT setval('commercialisti_id_seq', $MAXU)" >/dev/null
  C="k1d$SFX"; CT=$(reg_c "$C"); CID=$(q "SELECT id FROM commercialisti WHERE username='$C'")
fi
eq "studio registrato" "1" "$([ -n "$CID" ] && [ "$CT" != "-" ] && echo 1 || echo 0)"
# Serve un utente con lo stesso id dello studio: se non c'e' ancora, se ne
# registrano finche' la sequenza lo raggiunge.
n=0
while [ "$(q "SELECT count(*) FROM utenti WHERE id=$CID")" != 1 ] && [ $n -lt 200 ]; do
  reg_u "k1p$SFX$n" >/dev/null; n=$((n+1))
done
VITTIMA=$(q "SELECT username FROM utenti WHERE id=$CID")
eq "utente con lo stesso id dello studio" "1" "$(q "SELECT count(*) FROM utenti WHERE id=$CID")"
eq "stessa versione delle credenziali (il caso pericoloso)" \
  "$(q "SELECT versione_credenziali FROM commercialisti WHERE id=$CID")" "$(q "SELECT versione_credenziali FROM utenti WHERE id=$CID")"
q "INSERT INTO conti_correnti (user_id, nome_banca, intestatario, saldo_iniziale) VALUES ($CID, 'Banca K1', 'vittima', 1000)" >/dev/null
U="k1u$SFX"; UT=$(reg_u "$U"); UID_=$(q "SELECT id FROM utenti WHERE username='$U'")

echo
echo "=== A. token dello studio sulle rotte dell'utente $CID ==="
for p in auth/profile auth/verify movimenti conti-bancari anagrafiche reports/mesi auth/backup/export auth/account/stats utenti/collegamenti; do
  eq "GET /$p -> 401" "401" "$(code "$CT" "$API/$p")"
done
eq "nessun conto della vittima nella risposta" "0" "$(code "$CT" "$API/conti-bancari" >/dev/null; grep -c 'Banca K1' "$T/body")"
eq "DELETE /auth/account -> 401" "401" "$(code "$CT" -X DELETE "${JSON[@]}" -d '{"password":"x"}' "$API/auth/account")"
eq "POST /conti-bancari -> 401" "401" "$(code "$CT" -X POST "${JSON[@]}" -d '{"nome_banca":"x","intestatario":"x","saldo_iniziale":0}' "$API/conti-bancari")"
eq "la vittima esiste ancora con il suo conto" "1|1" "$(q "SELECT count(*) FROM utenti WHERE id=$CID")|$(q "SELECT count(*) FROM conti_correnti WHERE user_id=$CID AND nome_banca='Banca K1'")"

echo
echo "=== B. token dell'utente sulle rotte dello studio, rotte comuni ==="
eq "GET /commercialisti/profile con token utente -> 401" "401" "$(code "$UT" "$API/commercialisti/profile")"
eq "GET /commercialisti/profile con token studio -> 200" "200" "$(code "$CT" "$API/commercialisti/profile")"
eq "GET /auth/profile con token utente -> 200, e' lui" "200|$U" "$(code "$UT" "$API/auth/profile")|$(j "['username']" < "$T/body")"
eq "authEither: lo studio e' lo studio" "200" "$(code "$CT" "$API/messaggi/unread-count")"
eq "authEither: l'utente e' l'utente" "200" "$(code "$UT" "$API/messaggi/unread-count")"

echo
echo "=== C. token contraffatti (segreto giusto) ==="
CV=$(q "SELECT versione_credenziali FROM utenti WHERE id=$UID_")
eq "tipo sconosciuto (admin) -> 401" "401" "$(code "$(forgia "{\"id\":$UID_,\"cv\":$CV,\"tipo\":\"admin\"}")" "$API/auth/profile")"
eq "tipo sconosciuto su authEither -> 401" "401" "$(code "$(forgia "{\"id\":$UID_,\"cv\":$CV,\"tipo\":\"admin\"}")" "$API/messaggi/unread-count")"
eq "HS384 con lo stesso segreto -> 401" "401" "$(code "$(forgia "{\"id\":$UID_,\"cv\":$CV,\"tipo\":\"user\"}" HS384)" "$API/auth/profile")"
NONE="$(b64u '{"alg":"none","typ":"JWT"}').$(b64u "{\"id\":$UID_,\"cv\":$CV,\"tipo\":\"user\"}")."
eq "alg none -> 401" "401" "$(code "$NONE" "$API/auth/profile")"
eq "token utente senza tipo (prima di K1) -> 200" "200" "$(code "$(forgia "{\"id\":$UID_,\"username\":\"$U\",\"cv\":$CV}")" "$API/auth/profile")"
eq "token studio senza tipo non apre lo studio -> 401" "401" "$(code "$(forgia "{\"id\":$CID,\"cv\":0}")" "$API/commercialisti/profile")"

echo
echo "=== D. i token nuovi portano il tipo ==="
LT=$(curl -s -X POST "$API/auth/login" "${JSON[@]}" -d "{\"username\":\"$U\",\"password\":\"$PW\"}" | j "['token']")
LC=$(curl -s -X POST "$API/commercialisti/login" "${JSON[@]}" -d "{\"username\":\"$C\",\"password\":\"$PW\"}" | j "['token']")
eq "login utente: tipo user" "user" "$(payload "$LT" "['tipo']")"
eq "login studio: tipo commercialista" "commercialista" "$(payload "$LC" "['tipo']")"
eq "registrazione utente: tipo user" "user" "$(payload "$UT" "['tipo']")"
eq "algoritmo HS256" "HS256" "$(python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[0];print(json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))['alg'])" "$LT")"

echo
echo "=== E. registrazione ==="
ru() { hit -X POST "$API/auth/register" "${JSON[@]}" -d "$1"; }
rc() { hit -X POST "$API/commercialisti/register" "${JSON[@]}" -d "$1"; }
eq "utente, password di 7 -> 400" "400" "$(ru "{\"username\":\"k1a$SFX\",\"email\":\"k1a$SFX@t.it\",\"password\":\"Abcd12!\"}")"
eq "utente, password di 8 -> 201" "201" "$(ru "{\"username\":\"k1b$SFX\",\"email\":\"k1b$SFX@t.it\",\"password\":\"Abcd123!\"}")"
eq "studio, password di 7 -> 400" "400" "$(rc "{\"username\":\"k1d$SFX\",\"email\":\"k1d$SFX@t.it\",\"password\":\"Abcd12!\"}")"
eq "  e non creato" "0" "$(q "SELECT count(*) FROM commercialisti WHERE username='k1d$SFX'")"
eq "studio, password di 80 byte -> 400" "400" "$(rc "{\"username\":\"k1e$SFX\",\"email\":\"k1e$SFX@t.it\",\"password\":\"$(printf 'a%.0s' $(seq 1 80))\"}")"
eq "studio, email non valida -> 400" "400" "$(rc "{\"username\":\"k1f$SFX\",\"email\":\"non-una-mail\",\"password\":\"$PW\"}")"
eq "studio, username con spazi -> 400" "400" "$(rc "{\"username\":\"k1 g$SFX\",\"email\":\"k1g$SFX@t.it\",\"password\":\"$PW\"}")"
eq "studio, partita IVA di 5 cifre -> 400" "400" "$(rc "{\"username\":\"k1h$SFX\",\"email\":\"k1h$SFX@t.it\",\"password\":\"$PW\",\"partita_iva\":\"12345\"}")"
eq "studio con punto nello username (come mario.rossi) -> 201" "201" "$(rc "{\"username\":\"k1.i$SFX\",\"email\":\"k1i$SFX@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio I\",\"partita_iva\":\"\",\"telefono\":\"\"}")"

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
