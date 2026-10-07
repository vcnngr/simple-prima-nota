#!/usr/bin/env bash
# Smoke test del blocco U2 (fase UX, backend): tema e aspetto sull'account.
#
#   A. utente: GET/PUT /api/auth/preferenze, predefiniti, aggiornamento parziale,
#      valori rifiutati, preferenze nel login e nel profilo, isolamento fra utenti;
#   B. studio: GET/PUT /api/commercialisti/preferenze, login e profilo, token
#      dell'altro tipo rifiutati, nessuna scrittura sull'utente con lo stesso id;
#   C. database: CHECK e NOT NULL, account nati prima della 013 con i predefiniti;
#   D. migrazione 013: rollback (API -> 500 generico) e riapplicazione;
#   E. copia della 013 nel chart.
#
#   API=http://localhost:3001/api DB_CONTAINER=prima_nota_db ./scripts/smoke/u2-preferenze.sh
#
# La sezione D toglie e rimette la 013 sul database indicato: solo database di prova.
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
DB_PASSWORD="${DB_PASSWORD:-pw}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; trap 'rm -rf "${T:?}"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
hit() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" "$@"; }
py() { python3 -c "import sys,json;d=json.load(open('$T/body'));$1" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")
migra() {
  docker run --rm --network "container:$DB_CONTAINER" -e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD="$DB_PASSWORD" \
    -e PGDATABASE="$DB_NAME" -v "$R/database:/database:ro" docker.io/library/postgres:16.15-bookworm bash /database/migra.sh "$@" > "$T/migra" 2>&1
}
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio $1\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
pref() { py "print(d['tema']+'/'+d['aspetto'])"; }
# Le annulla in ordine dalla piu' recente fino alla 013 compresa.
annulla_013() {
  local v
  for v in $(q "SELECT string_agg(versione, ' ' ORDER BY versione DESC) FROM schema_migrazioni WHERE versione >= '013'"); do
    migra annulla "$v" || return 1
  done
}

echo "=== setup (suffisso $SFX) ==="
eq "migrazione 013 applicata" "1" "$(q "SELECT count(*) FROM schema_migrazioni WHERE versione='013'")"
U="u2a$SFX"; V="u2b$SFX"; C="u2c$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); CT=$(reg_c "$C")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); CID=$(q "SELECT id FROM commercialisti WHERE username='$C'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AC=(-H "Authorization: Bearer $CT")

echo
echo "=== A. utente ==="
eq "GET senza token -> 401" "401" "$(hit "$API/auth/preferenze")"
eq "PUT senza token -> 401" "401" "$(hit -X PUT "${JSON[@]}" -d '{"tema":"bottega"}' "$API/auth/preferenze")"
eq "GET -> 200" "200" "$(hit "${AU[@]}" "$API/auth/preferenze")"
eq "  predefinite registro/automatico" "registro/automatico" "$(pref)"
hit -X POST "${JSON[@]}" -d "{\"username\":\"$U\",\"password\":\"$PW\"}" "$API/auth/login" >/dev/null
eq "login -> preferenze nella risposta" "registro/automatico" "$(py "p=d['preferenze'];print(p['tema']+'/'+p['aspetto'])")"
eq "PUT solo tema -> 200, aspetto invariato" "200|bottega/automatico" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"bottega"}' "$API/auth/preferenze")|$(pref)"
eq "PUT solo aspetto -> 200, tema invariato" "200|bottega/scuro" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"aspetto":"scuro"}' "$API/auth/preferenze")|$(pref)"
eq "PUT entrambi -> 200" "200|registro/chiaro" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"registro","aspetto":"chiaro"}' "$API/auth/preferenze")|$(pref)"
hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"bottega","aspetto":"scuro"}' "$API/auth/preferenze" >/dev/null
eq "rilettura: salvate" "200|bottega/scuro" "$(hit "${AU[@]}" "$API/auth/preferenze")|$(pref)"
hit "${AU[@]}" "$API/auth/profile" >/dev/null
eq "profilo con tema e aspetto" "bottega/scuro" "$(pref)"
for b in '{"tema":"notte"}' '{"aspetto":"blu"}' '{}' '{"tema":""}' '{"tema":null}' '{"tema":["bottega"]}' '{"tema":"Bottega"}'; do
  eq "PUT $b -> 400" "400" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d "$b" "$API/auth/preferenze")"
done
hit "${AU[@]}" "$API/auth/preferenze" >/dev/null
eq "dopo i rifiuti: invariate" "bottega/scuro" "$(pref)"
eq "campo in piu' ignorato, id non toccato" "200|$UID_" \
  "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"bottega","id":1,"username":"x"}' "$API/auth/preferenze")|$(q "SELECT id FROM utenti WHERE username='$U'")"
hit "${AV[@]}" "$API/auth/preferenze" >/dev/null
eq "V ha le sue (predefinite)" "registro/automatico" "$(pref)"
hit -X PUT "${AV[@]}" "${JSON[@]}" -d '{"aspetto":"chiaro"}' "$API/auth/preferenze" >/dev/null
hit "${AU[@]}" "$API/auth/preferenze" >/dev/null
eq "la scelta di V non tocca U" "bottega/scuro" "$(pref)"

echo
echo "=== B. studio ==="
eq "GET -> 200, predefinite" "200|registro/automatico" "$(hit "${AC[@]}" "$API/commercialisti/preferenze")|$(pref)"
eq "PUT -> 200" "200|bottega/chiaro" "$(hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"tema":"bottega","aspetto":"chiaro"}' "$API/commercialisti/preferenze")|$(pref)"
hit -X POST "${JSON[@]}" -d "{\"username\":\"$C\",\"password\":\"$PW\"}" "$API/commercialisti/login" >/dev/null
eq "login dello studio -> preferenze, non dentro commercialista" "bottega/chiaro|False" \
  "$(py "p=d['preferenze'];print(p['tema']+'/'+p['aspetto']+'|'+str('tema' in d['commercialista'] or 'aspetto' in d['commercialista']))")"
hit "${AC[@]}" "$API/commercialisti/profile" >/dev/null
eq "profilo dello studio con le preferenze" "bottega/chiaro" "$(py "p=d['preferenze'];print(p['tema']+'/'+p['aspetto'])")"
eq "PUT {\"tema\":\"notte\"} -> 400" "400" "$(hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"tema":"notte"}' "$API/commercialisti/preferenze")"
eq "token di utente sullo studio -> 401" "401" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"registro"}' "$API/commercialisti/preferenze")"
eq "token di studio sull'utente -> 401" "401" "$(hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"tema":"registro"}' "$API/auth/preferenze")"
# Un utente con lo stesso id dello studio: la scelta dello studio non lo tocca.
q "UPDATE utenti SET tema='registro', aspetto='automatico' WHERE id=$CID" >/dev/null
hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"tema":"bottega","aspetto":"scuro"}' "$API/commercialisti/preferenze" >/dev/null
eq "la scelta dello studio non finisce su un utente (stesso id)" "registro/automatico|bottega/scuro" \
  "$(q "SELECT coalesce(max(tema||'/'||aspetto),'registro/automatico') FROM utenti WHERE id=$CID")|$(q "SELECT tema||'/'||aspetto FROM commercialisti WHERE id=$CID")"

echo
echo "=== C. database ==="
eq "CHECK: tema fuori elenco rifiutato" "1" "$(docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "UPDATE utenti SET tema='notte' WHERE id=$UID_" 2>&1 | grep -c 'utenti_tema_valido')"
eq "CHECK: aspetto fuori elenco rifiutato (studio)" "1" "$(docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "UPDATE commercialisti SET aspetto='blu' WHERE id=$CID" 2>&1 | grep -c 'commercialisti_aspetto_valido')"
eq "NOT NULL: niente tema nullo" "1" "$(docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "UPDATE utenti SET tema=NULL WHERE id=$UID_" 2>&1 | grep -c 'null value')"
# Account nati prima della 013: quelli di init.sql (admin, demo).
eq "account nati prima della 013 hanno i predefiniti" "registro/automatico" \
  "$(q "SELECT string_agg(DISTINCT tema||'/'||aspetto, ',') FROM utenti WHERE username IN ('admin','demo')")"

echo
echo "=== D. migrazione 013: rollback e riapplicazione ==="
annulla_013; eq "annulla 013: exit 0" "0" "$?"
eq "colonne tolte" "0" "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('utenti','commercialisti') AND column_name IN ('tema','aspetto')")"
eq "senza colonne: preferenze -> 500 generico" "500|0" \
  "$(hit "${AU[@]}" "$API/auth/preferenze")|$(grep -c -i -E 'column|tema|does not exist' "$T/body")"
eq "senza colonne: l'autenticazione non ne dipende (verify 200)" "200" "$(hit "${AU[@]}" "$API/auth/verify")"
migra; eq "riapplicata: exit 0" "0" "$?"
eq "colonne di nuovo, predefiniti su tutti" "4|registro/automatico" \
  "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('utenti','commercialisti') AND column_name IN ('tema','aspetto')")|$(q "SELECT string_agg(DISTINCT tema||'/'||aspetto, ',') FROM (SELECT tema, aspetto FROM utenti UNION ALL SELECT tema, aspetto FROM commercialisti) x")"
eq "API di nuovo 200" "200|200" "$(hit "${AU[@]}" "$API/auth/preferenze")|$(hit "${AC[@]}" "$API/commercialisti/preferenze")"

echo
echo "=== E. chart ==="
eq "013 copiata nel chart" "0" "$("$R/scripts/sincronizza-helm-db.sh" --verifica >/dev/null 2>&1; echo $?)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
