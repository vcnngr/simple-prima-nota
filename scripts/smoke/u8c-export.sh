#!/usr/bin/env bash
# Smoke test del blocco U8c: export dei movimenti con i filtri del Registro.
#
#   A. API: GET /movimenti/export?formato=csv|xlsx con gli stessi filtri di
#      GET /movimenti (periodo, conti, controparte, tipologie, categorie, tipo,
#      importo, ricerca): stesse righe e stesso saldo dell'elenco; date come il
#      database anche col backend fuori da UTC; CSV con BOM, celle-formula
#      neutralizzate, a capo e virgole protetti; XLSX con i fogli «Prima Nota» e
#      «Riepilogo»; isolamento fra utenti; token; formato e filtri illeggibili 400;
#      oltre 20.000 righe 400.
#   B. build, nginx con la CSP del progetto, browser: «Esporta» da computer e da
#      telefono, filtri riportati, file scaricato coi filtri, CSP.
#
#   API=http://127.0.0.1:33514/api DB_CONTAINER=pn-u7b-db ./scripts/smoke/u8c-export.sh
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
T="$(mktemp -d)"; NGX="u8cweb-$SFX"
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
conto() { q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('$1', 'X', $2, $3) RETURNING id"; }
tipologia() { q "INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, colore) VALUES ($1, '$2', '$3', '#6B7280') RETURNING id"; }
anag() { q "INSERT INTO anagrafiche (nome, user_id, tipologia_id) VALUES ('$1', $2, ${3:-NULL}) RETURNING id"; }
# mv giorni_fa conto descrizione importo tipo user anagrafica categoria note
mv() { q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id, anagrafica_id, categoria, note) VALUES (CURRENT_DATE - $1, $2, \$d\$$3\$d\$, $4, '$5', $6, ${7:-NULL}, ${8:-NULL}, ${9:-NULL}) RETURNING id"; }
# csv: righe dell'ultimo export come "Descrizione:Saldo" in ordine (senza l'apostrofo di protezione)
csvds() { python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));n=lambda d: d[1:] if d[:1]==chr(39) and d[1:2] in '=+-@' else d
print('|'.join(n(x['Descrizione'])+':'+x['Saldo'] for x in r))"; }
# lista: le stesse righe da GET /movimenti, dalla piu' vecchia
lista() { hit "${AU[@]}" "$API/movimenti?limit=1000&$1" >/dev/null; py "print('|'.join(m['descrizione']+':'+m['saldo_progressivo'] for m in reversed(d['movimenti'])))"; }
stesso() {  # stesso <nome> <query>: export CSV == elenco, e non vuoto
  local a b; a=$(lista "$2"); hit "${AU[@]}" "$API/movimenti/export?formato=csv&$2" >/dev/null; b=$(csvds)
  if [ -n "$a" ] && [ "$a" = "$b" ]; then ok "$1"; else ko "$1" "$a" "$b"; fi
}

echo "=== setup (suffisso $SFX) ==="
U="u8cu$SFX"; V="u8cv$SFX"; W="u8cw$SFX"; S="u8cs$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); WT=$(reg_u "$W"); ST=$(reg_c "$S" "Studio U8c $SFX")
[ -n "$UT" ] && [ -n "$VT" ] && [ -n "$WT" ] && [ -n "$ST" ] || { echo "registrazioni non riuscite"; exit 1; }
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AW=(-H "Authorization: Bearer $WT"); AS=(-H "Authorization: Bearer $ST")
UID_=$(uid "$U"); VID=$(uid "$V"); WID=$(uid "$W")
C1=$(conto Banca 1000.00 "$UID_"); C2=$(conto Cassa 50.00 "$UID_"); CV=$(conto AltraV 0 "$VID")
TF=$(tipologia "$UID_" Fornitori Uscita); ENEL=$(anag "Enel Energia" "$UID_" "$TF"); ROSSI=$(anag "Rossi srl" "$UID_")
mv 40 "$C1" Vendita1 300.00 Entrata "$UID_" "$ROSSI" "'Vendite'" >/dev/null
mv 30 "$C1" Bolletta1 80.10 Uscita "$UID_" "$ENEL" "'Utenze'" "'rif. 12, ottobre'" >/dev/null
mv 30 "$C2" Caffe 2.20 Uscita "$UID_" "" "'Bar'" >/dev/null
mv 20 "$C2" '=1+1' 10.00 Entrata "$UID_" "" "" "E'due righe\nseconda'" >/dev/null
mv 10 "$C1" Bolletta2 95.45 Uscita "$UID_" "$ENEL" "'Utenze'" >/dev/null
mv 0 "$C1" Vendita2 1250.00 Entrata "$UID_" "$ROSSI" "'Vendite'" >/dev/null
mv 5 "$CV" SegretoV 777.00 Entrata "$VID" >/dev/null
DAL=$(q "SELECT to_char(CURRENT_DATE - 31, 'YYYY-MM-DD')"); AL=$(q "SELECT to_char(CURRENT_DATE - 9, 'YYYY-MM-DD')")

echo
echo "=== A. API ==="
X="$API/movimenti/export"
eq "CSV: 200, testo, nome del file" "200|text/csv|prima_nota_" "$(hit -D "$T/h" "${AU[@]}" "$X?formato=csv")|$(grep -i '^content-type' "$T/h" | grep -o 'text/csv')|$(grep -io 'prima_nota_' "$T/h" | head -1)"
eq "CSV: BOM e intestazione" "True|Data,Conto,Controparte,Tipologia,Categoria,Descrizione,Entrate,Uscite,Saldo,Note" \
  "$(python3 -c "
import csv,io;b=open('$T/body','rb').read();r=list(csv.reader(io.StringIO(b.decode('utf-8-sig'))));print(b.startswith(b'\xef\xbb\xbf'),','.join(r[0]),sep='|')")"
eq "CSV: 6 righe, dalla piu' vecchia, saldo di tutti i conti" "Vendita1:1350.00|Bolletta1:1269.90|Caffe:1267.70|=1+1:1277.70|Bolletta2:1182.25|Vendita2:2432.25" "$(csvds)"
eq "CSV: date del database anche col backend fuori da UTC" "$(q "SELECT string_agg(to_char(data,'DD/MM/YYYY'), '|' ORDER BY data, id) FROM movimenti WHERE user_id=$UID_")" \
  "$(python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));print('|'.join(x['Data'] for x in r))")"
eq "CSV: cella-formula con l'apostrofo, nota su due righe e con la virgola" "'=1+1|due righe\\nseconda|rif. 12, ottobre" \
  "$(python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));f=[x for x in r if '1+1' in x['Descrizione']][0];b=[x for x in r if x['Descrizione']=='Bolletta1'][0]
print(f['Descrizione'],f['Note'].replace(chr(10),'\\\\n'),b['Note'],sep='|')")"
eq "CSV: entrate e uscite in colonne separate, controparte e tipologia" "|80.10|Enel Energia|Fornitori|Utenze" \
  "$(python3 -c "
import csv,io;r=list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())));b=[x for x in r if x['Descrizione']=='Bolletta1'][0];print(b['Entrate'],b['Uscite'],b['Controparte'],b['Tipologia'],b['Categoria'],sep='|')")"
eq "CSV: niente di V" "0" "$(grep -c SegretoV "$T/body")"

stesso "come l'elenco: un conto (saldo del conto)" "conti=$C1"
stesso "come l'elenco: due conti" "conti=$C1,$C2"
stesso "come l'elenco: solo entrate" "tipo=Entrata"
stesso "come l'elenco: solo uscite di un conto" "tipo=Uscita&conti=$C1"
stesso "come l'elenco: tipologia" "tipologie=$TF"
stesso "come l'elenco: due categorie" "categorie=Utenze&categorie=Bar"
stesso "come l'elenco: controparte" "anagrafica_id=$ROSSI"
stesso "come l'elenco: periodo" "data_inizio=$DAL&data_fine=$AL"
stesso "come l'elenco: importo da/a" "importo_min=10&importo_max=100"
stesso "come l'elenco: ricerca" "search=bolletta"
eq "filtri senza risultati: solo l'intestazione" "200|1" "$(hit "${AU[@]}" "$X?formato=csv&search=nessuno")|$(python3 -c "print(len(open('$T/body',encoding='utf-8-sig').read().strip().splitlines()))")"
eq "conto di V chiesto da U: nessuna riga" "200|1" "$(hit "${AU[@]}" "$X?formato=csv&conti=$CV")|$(python3 -c "print(len(open('$T/body',encoding='utf-8-sig').read().strip().splitlines()))")"
eq "export di V: solo il suo" "SegretoV:777.00" "$(hit "${AV[@]}" "$X?formato=csv" >/dev/null; csvds)"

eq "XLSX: 200, file zip" "200|PK" "$(hit "${AU[@]}" "$X?formato=xlsx&tipo=Uscita")|$(head -c 2 "$T/body")"
eq "XLSX: fogli Prima Nota e Riepilogo; 3 uscite, totale 177.75" "Prima Nota,Riepilogo|True|True" \
  "$(python3 -c "
import zipfile,re;z=zipfile.ZipFile('$T/body');w=z.read('xl/workbook.xml').decode()
fogli=re.findall(r'<sheet [^>]*name=\"([^\"]+)\"',w);s2=z.read('xl/worksheets/sheet2.xml').decode();s1=z.read('xl/worksheets/sheet1.xml').decode()
print(','.join(fogli),'177.75' in s2,s1.count('<row')==4,sep='|')")"
eq "formato sconosciuto, conto_id e conti insieme, filtri illeggibili: 400" "400|400|400|400" \
  "$(hit "${AU[@]}" "$X?formato=pdf")|$(hit "${AU[@]}" "$X?conto_id=$C1&conti=$C2")|$(hit "${AU[@]}" "$X?tipologie=abc")|$(hit "${AU[@]}" "$X?data_inizio=2026-02-30")"
eq "parametri dell'elenco ignorati (limit, offset)" "200|6" "$(hit "${AU[@]}" "$X?formato=csv&limit=1&offset=3")|$(python3 -c "
import csv,io;print(len(list(csv.DictReader(io.StringIO(open('$T/body',encoding='utf-8-sig').read())))))")"
eq "senza token 401" "401" "$(hit "$X")"
eq "col token dello studio: rifiutato" "True" "$(c=$(hit "${AS[@]}" "$X"); python3 -c "print($c in (401,403))")"
CW=$(conto W 0 "$WID")
q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) SELECT CURRENT_DATE - (g % 300), $CW, 'm'||g, 1, 'Entrata', $WID FROM generate_series(1, 20001) g RETURNING 1" >/dev/null
eq "oltre 20.000 righe: 400 col numero" "400|True" "$(hit "${AW[@]}" "$X?formato=csv")|$(py "print('20001' in d['error'])")"
eq "con un periodo piu' corto si esporta" "200" "$(hit "${AW[@]}" "$X?formato=csv&data_inizio=$(q "SELECT to_char(CURRENT_DATE - 10, 'YYYY-MM-DD')")")"

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
mkdir -p "$T/scaricati"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" SCARICATI="$T/scaricati" TOKEN="$UT" C1="$C1" \
  browser node "$R/scripts/smoke/lib/u8c-browser.mjs"
eq "file scaricato dal browser: solo le uscite di Banca, saldo di Banca" "Bolletta1:1219.90|Bolletta2:1124.45" \
  "$(f=$(ls -t "$T/scaricati"/prima_nota_*.csv 2>/dev/null | head -1); [ -n "$f" ] && cp "$f" "$T/body" && csvds)"
echo "  fotografie: $FOTO"

echo
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
