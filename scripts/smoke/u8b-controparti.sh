#!/usr/bin/env bash
# Smoke test del blocco U8b: controparti complete.
#
#   A. API: GET /anagrafiche/riepilogo (attive, disattivate, per tipologia, senza
#      tipologia, per categoria, senza categoria; solo dell'utente); filtri di
#      GET /anagrafiche/elenco (tipologie, senza_tipologia, categorie,
#      senza_categoria, attivo, combinati; tipologia di un altro utente: niente;
#      valori illeggibili 400); GET /anagrafiche/export (CSV con BOM e celle-formula
#      neutralizzate, filtri, XLSX, formato sconosciuto 400, isolamento, token).
#   B. build, nginx con la CSP del progetto, browser: tabella da 1366 px, schede a
#      390 px, conteggi per tipologia che filtrano, pannello dei filtri, etichette,
#      «Nuova controparte» fino alla sua scheda, export, nessuna violazione CSP.
#
#   API=http://127.0.0.1:33510/api DB_CONTAINER=pn-u7b-db ./scripts/smoke/u8b-controparti.sh
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
T="$(mktemp -d)"; NGX="u8bweb-$SFX"
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
U="u8bu$SFX"; V="u8bv$SFX"; S="u8bs$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); ST=$(reg_c "$S" "Studio U8b $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$ST" ] || { echo "registrazioni non riuscite"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AS=(-H "Authorization: Bearer $ST")
UID_=$(uid "$U"); VID=$(uid "$V")
TC=$(tipologia "$UID_" Clienti Entrata '#2F6B4F'); TF=$(tipologia "$UID_" Fornitori Uscita '#C08A1E')
TX=$(tipologia "$UID_" Vuota Entrambi '#6B7280'); TV=$(tipologia "$VID" "Di V" Entrambi '#7A4E9C')
q "INSERT INTO categorie_anagrafiche (user_id, nome) VALUES ($UID_, 'Energia') RETURNING id" >/dev/null
A=$(anag Alfa "$UID_" "$TC" "'Utenze'" true "'alfa@x.it'")
B=$(anag Beta "$UID_" "$TF" "'Affitto'")
C=$(anag Gamma "$UID_")
DL=$(anag Delta "$UID_" "$TC" "' '" false)
E=$(anag '=HYPERLINK("x")' "$UID_" "$TF" "'Affitto'")
X=$(anag "Di V srl" "$VID" "$TV" "'Utenze'")
C1=$(q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Banca', 'X', 0, $UID_) RETURNING id")
q "INSERT INTO movimenti (data, conto_id, anagrafica_id, descrizione, importo, tipo, user_id) VALUES (CURRENT_DATE, $C1, $A, 'a', 120.50, 'Entrata', $UID_), (CURRENT_DATE - 3, $C1, $A, 'b', 20.25, 'Uscita', $UID_) RETURNING id" >/dev/null

echo
echo "=== A. API ==="
eq "riepilogo: 200" "200" "$(hit "${AU[@]}" "$API/anagrafiche/riepilogo")"
eq "riepilogo: 5 controparti, 4 attive, 1 disattivata" "5|4|1" "$(py "print(d['totale'],d['attive'],d['disattivate'],sep='|')")"
eq "riepilogo: per tipologia (anche quella vuota), solo le sue" "Clienti:2|Fornitori:2|Vuota:0" \
  "$(py "print('|'.join(f\"{t['nome']}:{t['n']}\" for t in d['tipologie']))")"
eq "riepilogo: senza tipologia 1, senza categoria 2 (anche lo spazio)" "1|2" "$(py "print(d['senza_tipologia'],d['senza_categoria'],sep='|')")"
eq "riepilogo: categorie scritte e dell'elenco, niente di V" "Affitto:2|Utenze:1|Energia:0" \
  "$(py "print('|'.join(f\"{c['nome']}:{c['n']}\" for c in d['categorie']))")"
eq "riepilogo di V: solo il suo" "1|Di V:1" "$(hit "${AV[@]}" "$API/anagrafiche/riepilogo" >/dev/null; py "print(d['totale'],'|'.join(f\"{t['nome']}:{t['n']}\" for t in d['tipologie']),sep='|')")"
eq "riepilogo senza token: 401" "401" "$(hit "$API/anagrafiche/riepilogo")"
eq "riepilogo col token dello studio: rifiutato" "True" "$(c=$(hit "${AS[@]}" "$API/anagrafiche/riepilogo"); python3 -c "print($c in (401,403))")"

L="$API/anagrafiche/elenco?limit=50"
eq "elenco: una tipologia" "Alfa,Delta" "$(nomi "${AU[@]}" "$L&tipologie=$TC")"
eq "elenco: due tipologie" '=HYPERLINK("x"),Alfa,Beta,Delta' "$(nomi "${AU[@]}" "$L&tipologie=$TC,$TF")"
eq "elenco: tipologia o senza tipologia" "Alfa,Delta,Gamma" "$(nomi "${AU[@]}" "$L&tipologie=$TC&senza_tipologia=true")"
eq "elenco: solo senza tipologia" "Gamma" "$(nomi "${AU[@]}" "$L&senza_tipologia=true")"
eq "elenco: due categorie" '=HYPERLINK("x"),Alfa,Beta' "$(nomi "${AU[@]}" "$L&categorie=Utenze&categorie=Affitto")"
eq "elenco: senza categoria (vuota o spazio)" "Delta,Gamma" "$(nomi "${AU[@]}" "$L&senza_categoria=true")"
eq "elenco: disattivate" "Delta" "$(nomi "${AU[@]}" "$L&attivo=false")"
eq "elenco: combinati (Clienti, attive, Utenze)" "Alfa" "$(nomi "${AU[@]}" "$L&tipologie=$TC&attivo=true&categorie=Utenze")"
eq "elenco: totale coi filtri" "2" "$(hit "${AU[@]}" "$L&tipologie=$TC" >/dev/null; py "print(d['totale'])")"
eq "elenco: tipologia di V chiesta da U, niente" "200|0" "$(hit "${AU[@]}" "$L&tipologie=$TV")|$(py "print(len(d['anagrafiche']))")"
eq "elenco: categoria di V chiesta da U, niente di V" "Alfa" "$(nomi "${AU[@]}" "$L&categorie=Utenze")"
LUNGA=$(python3 -c "print('x'*101)")
eq "elenco: valori illeggibili 400" "400|400|400|400" \
  "$(hit "${AU[@]}" "$L&tipologie=abc")|$(hit "${AU[@]}" "$L&tipologie=0")|$(hit "${AU[@]}" "$L&categorie=$LUNGA")|$(hit "${AU[@]}" "$L&senza_tipologia=forse")"

X1="$API/anagrafiche/export"
eq "export CSV: 200, testo" "200|text/csv" "$(hit -D "$T/h" "${AU[@]}" "$X1?formato=csv")|$(grep -i '^content-type' "$T/h" | grep -o 'text/csv')"
eq "export CSV: BOM e intestazione" "True|Nome,Tipologia,Di solito,Categoria,Email,Telefono,P.IVA,Indirizzo,Stato,Movimenti,Entrate,Uscite,Ultimo movimento" \
  "$(python3 -c "
import csv,io;b=open('$T/body','rb').read();r=list(csv.reader(io.StringIO(b.decode('utf-8-sig'))));print(b.startswith(b'\xef\xbb\xbf'),','.join(r[0]),sep='|')")"
eq "export CSV: 5 righe, Alfa con 2 movimenti, 120.50 e 20.25" "5|2|120.50|20.25|alfa@x.it" \
  "$(python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));a=[x for x in r if x['Nome']=='Alfa'][0];print(len(r),a['Movimenti'],a['Entrate'],a['Uscite'],a['Email'],sep='|')")"
eq "export CSV: la cella-formula comincia con l'apostrofo" "'=HYPERLINK(\"x\")" \
  "$(python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));print([x['Nome'] for x in r if 'HYPERLINK' in x['Nome']][0])")"
eq "export CSV: niente di V" "0" "$(grep -c 'Di V' "$T/body")"
eq "export CSV coi filtri: Clienti attive" "Alfa" \
  "$(hit "${AU[@]}" "$X1?formato=csv&tipologie=$TC&attivo=true" >/dev/null; python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));print(','.join(x['Nome'] for x in r))")"
eq "export XLSX: 200, file zip" "200|PK" "$(hit "${AU[@]}" "$X1?formato=xlsx")|$(head -c 2 "$T/body")"
eq "export: formato sconosciuto 400" "400" "$(hit "${AU[@]}" "$X1?formato=pdf")"
eq "export: senza token 401" "401" "$(hit "$X1?formato=csv")"
# RED t_886b0088: = + - @ TAB CR in testa, anche dopo spazi o whitespace (utente a parte).
# Dall'API (come nella review) e dal DB per i caratteri di controllo.
W="u8bw$SFX"; WT=$(reg_u "$W"); WID=$(uid "$W")
for nome in "=1+1" " =1+1" "  @SUM(1,2)" "+3" "   +3" "-4x" " -4x" "@A1"; do
  hit -X POST -H "Authorization: Bearer $WT" "${JSON[@]}" "$API/anagrafiche" \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"nome":sys.argv[1]}))' "$nome")" >/dev/null
done
q "INSERT INTO anagrafiche (nome, user_id) VALUES (E'\\t=2+2', $WID), (E'\\r=5', $WID), (E'\\tciao', $WID),
  (E'\\rciao', $WID), (E' \\t-6', $WID), (E'  \\t@X', $WID), (E' \\r+7', $WID), (E' \\r\\n=8', $WID),
  (E'\\u00a0=9', $WID), (E'\\t \\t=10', $WID) RETURNING id" >/dev/null
eq "export CSV: 18 celle pericolose, tutte con l'apostrofo e il testo intatto dopo" "18|18|18" \
  "$(hit -H "Authorization: Bearer $WT" "$X1?formato=csv" >/dev/null; python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig',newline='').read())))
a=[x['Nome'] for x in r]
print(len(a),sum(1 for n in a if n.startswith(chr(39))),sum(1 for n in a if n[1:].lstrip()[:1] in '=+-@' or n[1:2] in '\\t\\r'),sep='|')")"
q "INSERT INTO anagrafiche (nome, user_id) VALUES ('  Rossi', $WID), (' Bianchi 2', $WID) RETURNING id" >/dev/null
eq "export CSV: spazi davanti a testo normale, niente apostrofo" "' Bianchi 2'|'  Rossi'" \
  "$(hit -H "Authorization: Bearer $WT" "$X1?formato=csv" >/dev/null; python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig',newline='').read())))
print('|'.join(repr(x['Nome']) for x in r if x['Nome'].strip() in ('Rossi','Bianchi 2')))")"
# shellcheck disable=SC2016
eq "cellaCsv: numeri restano numeri, formule dopo whitespace neutralizzate" \
  '["12","-4.5","0","-12.50","\"\u0027 =1\"","\"\u0027\t \t@x\"","\"\u0027\r+1\"","\"\u0027 -1\"","\"ciao =1\"","\"\u0027\tciao\""]' \
  "$(node -e "const {cellaCsv:c}=require('$R/backend/utils/csv');
console.log(JSON.stringify([c(12),c(-4.5),c('0'),c('-12.50'),c(' =1'),c('\\t \\t@x'),c('\\r+1'),c(' -1'),c('ciao =1'),c('\\tciao')]).replace(/'/g,'\\\\u0027'))")"
eq "export di V: solo il suo" "Di V srl" "$(hit "${AV[@]}" "$X1?formato=csv" >/dev/null; python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));print(','.join(x['Nome'] for x in r))")"
eq "nuova controparte con la tipologia di V: 400" "400" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche" -d "{\"nome\":\"Furba\",\"tipologia_id\":$TV}")"

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
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" TOKEN="$UT" TC="$TC" TF="$TF" \
  browser node "$R/scripts/smoke/lib/u8b-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== C. database dopo il browser ==="
eq "creata dal browser: nome, tipologia Fornitori, categoria Energia, email" "Nuova Ditta|$TF|Energia|info@nuova.it|Uscita" \
  "$(q "SELECT nome||'|'||tipologia_id||'|'||categoria||'|'||email||'|'||tipo_movimento_preferito FROM anagrafiche WHERE user_id=$UID_ AND nome='Nuova Ditta'")"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
