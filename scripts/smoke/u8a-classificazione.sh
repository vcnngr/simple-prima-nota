#!/usr/bin/env bash
# Smoke test del blocco U8a: classificazione dei movimenti e delle controparti.
#
#   A. API: GET /movimenti/categorie (elenco + scritte, conteggi, ordine per
#      tipo, isolamento, token dello studio rifiutato); filtri di GET /movimenti
#      per piu' categorie, piu' tipologie e importo da/a (anche 0), valori
#      illeggibili 400, saldo progressivo invariato; categoria e note in POST e
#      PUT; ultima_categoria in /anagrafiche/cerca e /anagrafiche/:id; tipologia
#      della controparte (propria si', altrui 400; «di solito» dalla tipologia).
#   B. build, nginx con la CSP del progetto, browser: categoria a bottoni con la
#      proposta della controparte, «+ Altra», nota, importo incollato e scritto
#      con la tastiera vera, tipologia e categoria a bottoni nella controparte,
#      «Altri filtri» da computer e dal telefono, etichette, nessuna violazione.
#
#   API=http://127.0.0.1:33502/api DB_CONTAINER=pn-u7b-db ./scripts/smoke/u8a-classificazione.sh
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
T="$(mktemp -d)"; NGX="u8aweb-$SFX"
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
# lista <query>: "descrizione:saldo" delle righe, separate da |
lista() { hit "${AU[@]}" "$API/movimenti?$1" >/dev/null; py "print('|'.join(m['descrizione']+':'+m['saldo_progressivo'] for m in d['movimenti']))"; }

echo "=== setup (suffisso $SFX) ==="
U="u8u$SFX"; V="u8v$SFX"; S="u8s$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); ST=$(reg_c "$S" "Studio U8 $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$ST" ] || { echo "registrazioni non riuscite"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AS=(-H "Authorization: Bearer $ST")
UID_=$(uid "$U"); VID=$(uid "$V")
C1=$(conto Banca 1000.00 "$UID_")
TF=$(tipologia "$UID_" Fornitori Uscita '#C08A1E'); TC=$(tipologia "$UID_" Clienti Entrata '#2F6B4F')
TV=$(tipologia "$VID" "Di V" Entrambi '#6B7280')
q "INSERT INTO categorie_movimenti (user_id, nome, tipo) VALUES ($UID_, 'Mai usata', 'Uscita') RETURNING id" >/dev/null
q "INSERT INTO categorie_anagrafiche (user_id, nome) VALUES ($UID_, 'Energia') RETURNING id" >/dev/null
ENEL=$(anag "Enel Energia" "$UID_" "$TF"); ROSSI=$(anag "Rossi srl" "$UID_" "$TC"); LIBERA=$(anag "Bar Sport" "$UID_")
# Movimenti di U (dal piu' vecchio): base 1000,00
mv 9 "$C1" A 100.00 Uscita "$UID_" "$ENEL" "'Bollette'" >/dev/null   #  900,00
mv 8 "$C1" B 300.00 Entrata "$UID_" "$ROSSI" "'Vendite'" >/dev/null  # 1200,00
mv 7 "$C1" C 50.00 Uscita "$UID_" "$ENEL" "'Utenze'" >/dev/null      # 1150,00
mv 6 "$C1" D 20.00 Uscita "$UID_" "$LIBERA" "'Bar'" >/dev/null       # 1130,00
mv 5 "$C1" E 10.00 Uscita "$UID_" NULL NULL >/dev/null               # 1120,00
CV=$(conto Altra 0 "$VID"); mv 1 "$CV" V1 5.00 Uscita "$VID" NULL "'Segreta di V'" >/dev/null

echo
echo "=== A. API ==="
eq "categorie: 200" "200" "$(hit "${AU[@]}" "$API/movimenti/categorie?tipo=Uscita")"
eq "categorie per le uscite: prima le usate, poi l'elenco" "Bar:1|Bollette:1|Utenze:1|Vendite:0|Mai usata:0" \
  "$(py "print('|'.join(c['nome']+':'+str(c['utilizzi_tipo']) for c in d['categorie']))")"
eq "categorie: niente di un altro utente" "False" "$(py "print(any(c['nome']=='Segreta di V' for c in d['categorie']))")"
eq "categorie: tipo sbagliato 400" "400" "$(hit "${AU[@]}" "$API/movimenti/categorie?tipo=Boh")"
eq "categorie col token dello studio: rifiutato" "True" "$(c=$(hit "${AS[@]}" "$API/movimenti/categorie"); python3 -c "print($c in (401,403))")"
eq "categorie senza token: 401" "401" "$(hit "$API/movimenti/categorie")"

eq "filtro una categoria, saldo vero" "C:1150.00" "$(lista "categorie=Utenze")"
eq "filtro due categorie" "C:1150.00|A:900.00" "$(lista "categorie=Utenze&categorie=Bollette")"
eq "categoria di un altro utente: niente" "" "$(lista "categorie=Segreta%20di%20V")"
eq "filtro tipologia (Fornitori)" "C:1150.00|A:900.00" "$(lista "tipologie=$TF")"
eq "due tipologie" "C:1150.00|B:1200.00|A:900.00" "$(lista "tipologie=$TF,$TC")"
eq "tipologia di un altro utente: niente" "" "$(lista "tipologie=$TV")"
eq "importo da 50 a 100" "C:1150.00|A:900.00" "$(lista "importo_min=50&importo_max=100")"
eq "importo da 0 (prima ignorato come falso): tutte" "5" "$(hit "${AU[@]}" "$API/movimenti?importo_min=0" >/dev/null; py "print(len(d['movimenti']))")"
eq "importo fino a 0: nessuna riga" "0" "$(hit "${AU[@]}" "$API/movimenti?importo_max=0" >/dev/null; py "print(len(d['movimenti']))")"
eq "categoria + tipologia + importo + tipo" "C:1150.00" "$(lista "categorie=Utenze&categorie=Bollette&tipologie=$TF&importo_max=60&tipo=Uscita")"
eq "totali col filtro di categoria" "2|150.00" "$(hit "${AU[@]}" "$API/movimenti?categorie=Utenze&categorie=Bollette" >/dev/null; py "print(d['totali']['numero_movimenti'], d['totali']['totale_uscite'], sep='|')")"
eq "tipologie illeggibili 400" "400" "$(hit "${AU[@]}" "$API/movimenti?tipologie=1,abc")"
eq "categoria troppo lunga 400" "400" "$(hit "${AU[@]}" "$API/movimenti?categorie=$(python3 -c "print('x'*101)")")"
eq "categoria vuota 400" "400" "$(hit "${AU[@]}" "$API/movimenti?categorie=")"
eq "categorie a oggetto 400" "400" "$(hit "${AU[@]}" "$API/movimenti?categorie%5Bx%5D=1")"

eq "POST con categoria e note: 201" "201" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/movimenti" -d "{\"data\":\"$(date +%F)\",\"conto_id\":$C1,\"anagrafica_id\":$ENEL,\"descrizione\":\"F\",\"categoria\":\"Utenze\",\"note\":\"rif. fattura 12\",\"importo\":\"7.50\",\"tipo\":\"Uscita\"}")"
MF=$(py "print(d['id'])")
eq "salvati categoria e note" "Utenze|rif. fattura 12" "$(q "SELECT categoria||'|'||note FROM movimenti WHERE id=$MF")"
eq "PUT toglie la nota e cambia categoria" "200|Bollette|-" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/movimenti/$MF" -d '{"categoria":"Bollette","note":null}')|$(q "SELECT categoria||'|'||coalesce(note,'-') FROM movimenti WHERE id=$MF")"

eq "cerca: ultima categoria della controparte" "Bollette|Vendite|Bar" \
  "$(hit "${AU[@]}" "$API/anagrafiche/cerca?limit=10" >/dev/null; py "m={a['nome']:a['ultima_categoria'] for a in d['risultati']};print(m['Enel Energia'],m['Rossi srl'],m['Bar Sport'],sep='|')")"
eq "scheda della controparte: ultima categoria" "Bollette" "$(hit "${AU[@]}" "$API/anagrafiche/$ENEL" >/dev/null; py "print(d['ultima_categoria'])")"
eq "controparte: tipologia propria, «di solito» dalla tipologia" "200|$TC|Entrata" \
  "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$LIBERA" -d "{\"tipologia_id\":$TC,\"tipo_movimento_preferito\":\"Uscita\"}")|$(q "SELECT tipologia_id||'|'||tipo_movimento_preferito FROM anagrafiche WHERE id=$LIBERA")"
eq "controparte: tipologia di un altro utente 400" "400|$TC" \
  "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$LIBERA" -d "{\"tipologia_id\":$TV}")|$(q "SELECT tipologia_id FROM anagrafiche WHERE id=$LIBERA")"
eq "controparte: tipologia tolta" "200|-" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$LIBERA" -d '{"tipologia_id":null}')|$(q "SELECT coalesce(tipologia_id::text,'-') FROM anagrafiche WHERE id=$LIBERA")"
# per il browser: ultima categoria di Enel = Bollette (F, 7,50 oggi); Bar Sport senza tipologia

echo
echo "=== B. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
PRIMA=$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" ENEL="$ENEL" LIBERA="$LIBERA" TF="$TF" TC="$TC" \
  browser node "$R/scripts/smoke/lib/u8a-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== C. database dopo il browser ==="
eq "registrati dal browser: due movimenti" "$((PRIMA + 2))" "$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")"
eq "incollato 1.234,56, categoria proposta, nota" "1234.56|Uscita|Bollette|pagata con bonifico|$ENEL" \
  "$(q "SELECT importo||'|'||tipo||'|'||categoria||'|'||note||'|'||anagrafica_id FROM movimenti WHERE user_id=$UID_ AND descrizione='Incollato'")"
eq "scritto con la tastiera: 12,30, categoria nuova, senza nota" "12.30|Cancelleria|-" \
  "$(q "SELECT importo||'|'||categoria||'|'||coalesce(note,'-') FROM movimenti WHERE user_id=$UID_ AND descrizione='Tastiera'")"
eq "categoria nuova anche nell'elenco" "1" "$(q "SELECT count(*) FROM categorie_movimenti WHERE user_id=$UID_ AND nome='Cancelleria'")"
eq "controparte dal browser: tipologia Fornitori, di solito Uscita, categoria Energia" "$TF|Uscita|Energia" \
  "$(q "SELECT tipologia_id||'|'||tipo_movimento_preferito||'|'||categoria FROM anagrafiche WHERE id=$LIBERA")"
eq "tipologia nuova creata dal browser" "1" "$(q "SELECT count(*) FROM tipologie_anagrafiche WHERE user_id=$UID_ AND nome='Ospiti'")"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
