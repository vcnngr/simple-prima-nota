#!/usr/bin/env bash
# Smoke test del blocco U4 (fase UX): componenti del nuovo frontend e
# registrazione di un movimento.
#
#   A. logica pura di web/src/util (centesimi interi, tastierino con + − =,
#      giorni nel fuso del dispositivo), con TZ=Europe/Rome;
#   B. API: vista dell'Estratto sull'account (GET/PUT .../preferenze, valori
#      rifiutati, login, studio, isolamento);
#   C. API: `giorno` (YYYY-MM-DD) nei movimenti, uguale alla data del database
#      anche con il backend in un fuso diverso da UTC;
#   D. migrazione 014: CHECK, rollback (API -> 500 generico, login 200) e
#      riapplicazione;
#   E. build e browser (Chrome headless, nginx con la CSP vera): Estratto a
#      cursore senza righe saltate o ripetute, saldo, quattro viste scelte
#      dalle impostazioni, cambio di conto nel bottom sheet, nuovo movimento
#      con ricerca della controparte e somma degli scontrini, importi
#      rifiutati, Esc, doppio tocco su Registra, 390 px, zero violazioni CSP;
#   F. database dopo il browser: importo, tipo, giorno e conto registrati;
#   G. copia della 014 nel chart.
#
#   API=http://127.0.0.1:3220/api DB_CONTAINER=pn-u4-db ./scripts/smoke/u4-componenti.sh
#
# La sezione D toglie e rimette la 014 sul database indicato: solo database di
# prova. Fotografie in FOTO (predefinito: temporanea). Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
DB_PASSWORD="${DB_PASSWORD:-pw}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; NGX="u4web-$SFX"
trap 'docker rm -f "$NGX" >/dev/null 2>&1; rm -rf "${T:?}"' EXIT
FOTO="${FOTO:-$T/foto}"; mkdir -p "$FOTO"
D="$R/web"

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
annulla_014() {
  local v
  for v in $(q "SELECT string_agg(versione, ' ' ORDER BY versione DESC) FROM schema_migrazioni WHERE versione >= '014'"); do
    migra annulla "$v" || return 1
  done
}
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | tok; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio $1\"}" | tok; }
browser() {  # browser <file .mjs>: conteggi in PASS/FAIL
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}

echo "=== A. logica (web/src/util) ==="
browser env TZ=Europe/Rome node "$R/scripts/smoke/lib/u4-logica.mjs" "$D/src"

echo
echo "=== B. vista dell'Estratto sull'account ==="
eq "migrazione 014 applicata" "1" "$(q "SELECT count(*) FROM schema_migrazioni WHERE versione='014'")"
U="u4a$SFX"; V="u4b$SFX"; C="u4c$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); CT=$(reg_c "$C")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); CID=$(q "SELECT id FROM commercialisti WHERE username='$C'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AC=(-H "Authorization: Bearer $CT")
pv() { py "print(d['tema']+'/'+d['aspetto']+'/'+d['vista_estratto'])"; }
eq "GET: predefinita due_righe" "200|registro/automatico/due_righe" "$(hit "${AU[@]}" "$API/auth/preferenze")|$(pv)"
eq "PUT solo vista: tema e aspetto invariati" "200|registro/automatico/mastro" \
  "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"vista_estratto":"mastro"}' "$API/auth/preferenze")|$(pv)"
eq "PUT solo tema: vista invariata" "200|bottega/automatico/mastro" \
  "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"tema":"bottega"}' "$API/auth/preferenze")|$(pv)"
for b in '{"vista_estratto":"tabella"}' '{"vista_estratto":"MASTRO"}' '{"vista_estratto":""}' '{"vista_estratto":null}' '{"vista_estratto":["colonne"]}' '{"vista":"colonne"}'; do
  eq "PUT $b -> 400" "400" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d "$b" "$API/auth/preferenze")"
done
eq "dopo i rifiuti: invariate" "bottega/automatico/mastro" "$(hit "${AU[@]}" "$API/auth/preferenze" >/dev/null; pv)"
hit -X POST "${JSON[@]}" -d "{\"username\":\"$U\",\"password\":\"$PW\"}" "$API/auth/login" >/dev/null
eq "login: vista nelle preferenze" "mastro" "$(py "print(d['preferenze']['vista_estratto'])")"
hit "${AU[@]}" "$API/auth/profile" >/dev/null
eq "profilo: vista nelle preferenze" "mastro" "$(py "print(d['preferenze']['vista_estratto'])")"
eq "V ha la sua (predefinita)" "due_righe" "$(hit "${AV[@]}" "$API/auth/preferenze" >/dev/null; py "print(d['vista_estratto'])")"
eq "studio: GET e PUT" "200|colonne" "$(hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"vista_estratto":"colonne"}' "$API/commercialisti/preferenze")|$(py "print(d['vista_estratto'])")"
eq "token di studio sull'utente / di utente sullo studio -> 401" "401|401" \
  "$(hit -X PUT "${AC[@]}" "${JSON[@]}" -d '{"vista_estratto":"iniziali"}' "$API/auth/preferenze")|$(hit -X PUT "${AU[@]}" "${JSON[@]}" -d '{"vista_estratto":"iniziali"}' "$API/commercialisti/preferenze")"
eq "la scelta dello studio non tocca l'utente con lo stesso id" "colonne|ok" \
  "$(q "SELECT vista_estratto FROM commercialisti WHERE id=$CID")|$(q "SELECT CASE WHEN count(*)=0 OR bool_and(vista_estratto<>'iniziali') THEN 'ok' ELSE 'ko' END FROM utenti WHERE id=$CID")"

echo
echo "=== C. giorno dei movimenti ==="
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Banca Intesa', 'U4', 1000, $UID_), ('Cassa', 'U4', 50, $UID_)" >/dev/null
C1=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Banca Intesa'"); C2=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Cassa'")
q "INSERT INTO anagrafiche (nome, user_id, attivo, tipo_movimento_preferito) VALUES
   ('Bianchi e Rossi srl', $UID_, true, 'Entrata'), ('Enel Energia', $UID_, true, 'Uscita'), ('Aruba spa', $UID_, true, 'Uscita')" >/dev/null
q "INSERT INTO anagrafiche (nome, user_id, attivo) SELECT 'Fornitore ' || g, $UID_, true FROM generate_series(1, 300) g" >/dev/null
aid() { q "SELECT id FROM anagrafiche WHERE user_id=$UID_ AND nome='$1'"; }
ENEL=$(aid 'Enel Energia'); BIANCHI=$(aid 'Bianchi e Rossi srl'); ARUBA=$(aid 'Aruba spa')
# 75 movimenti su 25 giorni, fino a ieri; Enel la piu' usata (15), Bianchi 3.
q "INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, user_id)
   SELECT CURRENT_DATE - 1 - (g / 3), CASE WHEN g % 5 = 0 THEN $ENEL WHEN g % 25 = 1 THEN $BIANCHI WHEN g % 7 = 0 THEN $ARUBA END,
          $C1, 'mov ' || g, CASE WHEN g % 2 = 0 THEN 'Utenze' END,
          CASE WHEN g % 4 = 0 THEN 900 + (g * 53 % 1500) + 0.25 * (g % 3) ELSE 1 + (g * 37 % 300) + 0.15 * (g % 7) END,
          CASE WHEN g % 4 = 0 THEN 'Entrata' ELSE 'Uscita' END, $UID_
   FROM generate_series(0, 74) g" >/dev/null
NMOV=$(q "SELECT count(*) FROM movimenti WHERE conto_id=$C1")
eq "dati di prova: 75 movimenti, 303 controparti" "75|303" "$NMOV|$(q "SELECT count(*) FROM anagrafiche WHERE user_id=$UID_")"
hit "${AU[@]}" "$API/movimenti?conto_id=$C1&limit=100" >/dev/null
eq "giorno = data del database su tutte le righe" "$NMOV|0" \
  "$(py "print(len(d['movimenti']))")|$(python3 -c "
import json,subprocess
d=json.load(open('$T/body'))
db=dict(l.split('|') for l in subprocess.run(['docker','exec','$DB_CONTAINER','psql','-X','-U','postgres','-d','$DB_NAME','-tA','-c',
  \"SELECT id, to_char(data,'YYYY-MM-DD') FROM movimenti WHERE conto_id=$C1\"],capture_output=True,text=True).stdout.split())
print(sum(1 for m in d['movimenti'] if m.get('giorno')!=db[str(m['id'])]))" 2>/dev/null || echo -)"
MID=$(q "SELECT max(id) FROM movimenti WHERE conto_id=$C1")
hit "${AU[@]}" "$API/movimenti/$MID" >/dev/null
eq "giorno anche nel dettaglio" "$(q "SELECT to_char(data,'YYYY-MM-DD') FROM movimenti WHERE id=$MID")" "$(py "print(d['giorno'])")"
SALDO=$(q "SELECT (calcola_saldo_conto($C1) * 100)::bigint")

echo
echo "=== D. migrazione 014 ==="
eq "CHECK: vista fuori elenco rifiutata" "1" "$(docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "UPDATE utenti SET vista_estratto='tabella' WHERE id=$UID_" 2>&1 | grep -c 'utenti_vista_estratto_valida')"
eq "account nati prima della 014: predefinita" "due_righe" "$(q "SELECT string_agg(DISTINCT vista_estratto, ',') FROM utenti WHERE username IN ('admin','demo')")"
annulla_014; eq "annulla 014: exit 0" "0" "$?"
eq "colonne tolte, tema intatto" "0|bottega" "$(q "SELECT count(*) FROM information_schema.columns WHERE column_name='vista_estratto'")|$(q "SELECT tema FROM utenti WHERE id=$UID_")"
eq "senza colonna: preferenze -> 500 generico" "500|0" "$(hit "${AU[@]}" "$API/auth/preferenze")|$(grep -c -i -E 'column|vista|does not exist' "$T/body")"
eq "senza colonna: login 200, preferenze null" "200|None" \
  "$(hit -X POST "${JSON[@]}" -d "{\"username\":\"$U\",\"password\":\"$PW\"}" "$API/auth/login")|$(py "print(d['preferenze'])")"
migra; eq "riapplicata: exit 0" "0" "$?"
eq "colonna di nuovo, predefinita su tutti" "2|due_righe" \
  "$(q "SELECT count(*) FROM information_schema.columns WHERE column_name='vista_estratto'")|$(q "SELECT string_agg(DISTINCT vista_estratto, ',') FROM (SELECT vista_estratto FROM utenti UNION ALL SELECT vista_estratto FROM commercialisti) x")"

echo
echo "=== E. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "nessuna mappa, nessuno script in linea" "0|0" "$(find "$D/dist" -name '*.map' | wc -l | tr -d ' ')|$(python3 -c "import re;h=open('$D/dist/index.html').read();print(len([s for s in re.findall(r'<script[^>]*>', h) if 'src=' not in s]))" 2>/dev/null || echo -)"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
eq "nessun parseFloat/toFixed sugli importi in src" "0" "$(cd "$D" && grep -rlE 'parseFloat|toFixed' src | wc -l | tr -d ' ')"
eq "nessun toISOString per le date in src" "0" "$(cd "$D" && grep -rlE '\.toISOString\(' src | wc -l | tr -d ' ')"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/frontend/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 30); do curl -s --max-time 1 -o /dev/null "$WEB/api/health" && break; sleep 0.5; done
eq "nginx con la CSP del progetto davanti alla build" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
OGGI=$(date +%F)
browser env WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" UTENTE="$U" PW="$PW" SALDO="$SALDO" NMOV="$NMOV" CASSA="$C2" \
  node "$R/scripts/smoke/lib/u4-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== F. database dopo il browser ==="
eq "18,90 registrato: Entrata, Bianchi, oggi, Banca Intesa" "18.90|Entrata|$BIANCHI|$OGGI|$C1|Bianchi e Rossi srl" \
  "$(q "SELECT importo||'|'||tipo||'|'||anagrafica_id||'|'||to_char(data,'YYYY-MM-DD')||'|'||conto_id||'|'||descrizione FROM movimenti WHERE user_id=$UID_ AND importo=18.90 AND descrizione NOT LIKE 'mov %'")"
eq "totale negativo e Esc: nulla registrato" "0" "$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND descrizione='prova negativa'")"
eq "tre tocchi su Registra: un solo movimento da 7,77 (Uscita)" "1|Uscita" "$(q "SELECT count(*)||'|'||string_agg(DISTINCT tipo, ',') FROM movimenti WHERE user_id=$UID_ AND importo=7.77 AND descrizione NOT LIKE 'mov %'")"
eq "vista lasciata dal browser: due_righe" "due_righe" "$(q "SELECT vista_estratto FROM utenti WHERE id=$UID_")"

echo
echo "=== G. chart ==="
eq "014 copiata nel chart" "0" "$("$R/scripts/sincronizza-helm-db.sh" --verifica >/dev/null 2>&1; echo $?)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
