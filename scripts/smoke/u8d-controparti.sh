#!/usr/bin/env bash
# Smoke test del blocco U8d: correzioni alle controparti (segnalate il 19/11/2026).
#
#   A. API: GET /anagrafiche/elenco?q= trova per nome (la pagina non mandava q).
#   B. browser: la ricerca della pagina Controparti filtra davvero (prima: nessun
#      effetto); nella «Nuova controparte» tipologie e categorie hanno un campo
#      di ricerca su TUTTE le voci (anche oltre le 8 piu' usate, anche le
#      categorie scritte solo sulle controparti e non nell'elenco), «Tutte (n)»,
#      «Crea» solo per un nome che non c'e'; salvataggio con la voce trovata.
#
#   API=http://127.0.0.1:33530/api DB_CONTAINER=pn-u8d-db ./scripts/smoke/u8d-controparti.sh
#
# Esce 1 se un caso fallisce.
set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T="$(mktemp -d)"; NGX="u8dweb-$SFX"
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
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | tok; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"$2\"}" | tok; }
uid() { q "SELECT id FROM utenti WHERE username='$1'"; }
conto() { q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('$1', 'X', $2, $3) RETURNING id"; }
tipologia() { q "INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, colore) VALUES ($1, '$2', '$3', '$4') RETURNING id"; }
anag() { q "INSERT INTO anagrafiche (nome, user_id, tipologia_id) VALUES ('$1', $2, ${3:-NULL}) RETURNING id"; }
# mv <giorno-relativo> <conto> <descr> <importo> <tipo> <utente> <anagrafica|NULL> <categoria|NULL>
mv() { q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id, anagrafica_id, categoria) VALUES (CURRENT_DATE - $1, $2, '$3', $4, '$5', $6, $7, $8) RETURNING id"; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}
tipologia() { q "INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, colore) VALUES ($1, '$2', '$3', '$4') RETURNING id"; }
# anag nome user tipologia categoria attivo
anag() { q "INSERT INTO anagrafiche (nome, user_id, tipologia_id, categoria, attivo, email) VALUES (\$n\$$1\$n\$, $2, ${3:-NULL}, ${4:-NULL}, ${5:-true}, ${6:-NULL}) RETURNING id"; }
nomi() { hit "$@" >/dev/null; py "print(','.join(sorted(a['nome'] for a in d['anagrafiche'])))"; }

echo "=== setup (suffisso $SFX) ==="
U="u8du$SFX"; UT=$(reg_u "$U")
[ -n "$UT" ] || { echo "registrazione non riuscita"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); UID_=$(uid "$U")
# 12 tipologie: T01..T11 usate da 11-n controparti, «Rara» da nessuna.
for i in $(seq -w 1 11); do eval "T$i=\$(tipologia \"\$UID_\" \"Tipo $i\" Entrambi '#6B7280')"; done
TR=$(tipologia "$UID_" "Rara" Uscita '#B4442E')
# Categorie: «Energia» solo nell'elenco; «Cat 01»..«Cat 11» scritte solo sulle controparti.
q "INSERT INTO categorie_anagrafiche (user_id, nome) VALUES ($UID_, 'Energia') RETURNING id" >/dev/null
for i in $(seq 1 11); do
  for j in $(seq $i 11); do
    k=$(printf %02d $i); anag "Ditta $k-$j" "$UID_" "$(eval echo \$T$k)" "'Cat $k'" >/dev/null
  done
done
anag "Alfa Ricambi" "$UID_" >/dev/null; anag "Beta Servizi" "$UID_" >/dev/null

echo
echo "=== A. API ==="
eq "elenco?q=alfa: solo Alfa Ricambi" "Alfa Ricambi" "$(nomi "${AU[@]}" "$API/anagrafiche/elenco?q=alfa")"
eq "riepilogo: 12 tipologie, 12 categorie (11 solo sulle controparti)" "12|12" \
  "$(hit "${AU[@]}" "$API/anagrafiche/riepilogo" >/dev/null; py "print(len(d['tipologie']),len(d['categorie']),sep='|')")"

echo
echo "=== B. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" TR="$TR" \
  browser node "$R/scripts/smoke/lib/u8d-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== C. database dopo il browser ==="
eq "Nuova Prova: tipologia Rara, categoria Cat 11 (trovate con la ricerca)" "Rara|Cat 11" \
  "$(q "SELECT t.nome||'|'||a.categoria FROM anagrafiche a JOIN tipologie_anagrafiche t ON t.id=a.tipologia_id WHERE a.user_id=$UID_ AND a.nome='Nuova Prova'")"
eq "nessuna tipologia doppia, nessuna «Cat 11» creata nell'elenco" "12|0" \
  "$(q "SELECT (SELECT count(*) FROM tipologie_anagrafiche WHERE user_id=$UID_)||'|'||(SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND lower(nome)='cat 11')")"
eq "«Crea» per un nome nuovo: categoria «Ricambi auto» nell'elenco e sulla controparte" "1|Ricambi auto" \
  "$(q "SELECT (SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND nome='Ricambi auto')||'|'||coalesce((SELECT categoria FROM anagrafiche WHERE user_id=$UID_ AND nome='Seconda Prova'),'-')")"

eq "Invio su «Ricambi» (parziale): creata «Ricambi», «Ricambi auto» resta una" "1|1" \
  "$(q "SELECT (SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND nome='Ricambi')||'|'||(SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND nome='Ricambi auto')")"
eq "tre Invio: una sola «Duplicata70»; Terza Prova con Duplicata70" "1|Duplicata70" \
  "$(q "SELECT (SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND nome='Duplicata70')||'|'||coalesce((SELECT categoria FROM anagrafiche WHERE user_id=$UID_ AND nome='Terza Prova'),'-')")"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
