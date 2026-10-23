#!/usr/bin/env bash
# Smoke test del blocco U6b, parte 2 (fase UX): categorie, import ed export.
#
#   A. API import CSV: anteprima che non scrive niente; tutto il file in una
#      transazione, ogni riga sbagliata annullata per intero (niente controparti
#      o conti orfani); importi in centesimi (1.234,50, 6,5, 1234.5), rifiutati
#      1.234 (ambiguo), 12abc, tre decimali, negativi, oltre 10 cifre; giorni veri
#      (30/02 rifiutato, GG/MM/AAAA accettato); niente conto per somiglianza;
#      BOM; tetto di righe; somme uguali al database;
#   B. API categorie: rinomina che porta con se' movimenti e controparti; le
#      categorie delle controparti nella loro tabella; conteggi e eliminazione
#      solo sui dati dell'utente; nomi doppi 400 (non 500); isolamento;
#   C. API copia di sicurezza: ripristino tutto o niente (copia difettosa: 400 e
#      dati intatti), sostituzione e aggiunta, modalita' sconosciuta;
#      export CSV del periodo con giorni e importi del database;
#   D. build e browser (Chrome headless, nginx con la CSP vera): Categorie e
#      Import ed export; 390 px, zero violazioni CSP; fotografie nei due temi;
#   E. database dopo il browser.
#
#   API=http://127.0.0.1:33360/api DB_CONTAINER=pn-u6-db TZ_BACKEND=America/Los_Angeles ./scripts/smoke/u6b-archivio.sh
#
# Fotografie in FOTO (predefinito: temporanea). Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; NGX="u6b2web-$SFX"
trap 'docker rm -f "$NGX" >/dev/null 2>&1; rm -rf "${T:?}"' EXIT
FOTO="${FOTO:-$T/foto}"; mkdir -p "$FOTO"
D="$R/web"

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
hit() { curl -s --max-time 30 -o "$T/body" -w "%{http_code}" "$@"; }
py() { python3 -c "import sys,json;d=json.load(open('$T/body'));$1" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | tok; }
# imp <token> <file csv> [anteprima]: POST /movimenti/import, corpo in $T/body
imp() {
  python3 -c "import json,sys;json.dump({'csvData':open(sys.argv[1],encoding='utf-8').read()},open(sys.argv[2],'w'))" "$2" "$T/imp.json"
  hit -X POST -H "Authorization: Bearer $1" "${JSON[@]}" "$API/movimenti/import${3:+?anteprima=1}" -d @"$T/imp.json"
}
conta() { q "SELECT (SELECT count(*) FROM movimenti WHERE user_id=$1)||'|'||(SELECT count(*) FROM anagrafiche WHERE user_id=$1)||'|'||(SELECT count(*) FROM conti_correnti WHERE user_id=$1)||'|'||(SELECT count(*) FROM tipologie_anagrafiche WHERE user_id=$1)"; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}

echo "=== setup (suffisso $SFX) ==="
U="u6ba$SFX"; V="u6bb$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); VID=$(q "SELECT id FROM utenti WHERE username='$V'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT")
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Cassa Rurale', 'U', 100, $UID_), ('Banca V', 'V', 10, $VID)" >/dev/null
RURALE=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Cassa Rurale'")
CV=$(q "SELECT id FROM conti_correnti WHERE user_id=$VID")
# V usa una categoria «Varie» e una categoria di controparte «Fornitori» con lo stesso nome di U.
q "INSERT INTO anagrafiche (nome, user_id, categoria) VALUES ('Enel di V', $VID, 'Fornitori')" >/dev/null
q "INSERT INTO movimenti (data, conto_id, descrizione, categoria, importo, tipo, user_id) VALUES ('2026-01-10', $CV, 'Spesa V', 'Varie', 999, 'Uscita', $VID)" >/dev/null

echo
echo "=== A. import CSV ==="
printf '\xef\xbb\xbfData;Descrizione;Importo;Tipo;Anagrafica;Conto;Categoria_Movimento\n2026-02-28;Fattura 1;1.234,50;Entrata;Rossi srl;Banca Nuova;Vendite\n05/03/2026;Bar;6,5;Uscita;Bar Roma;Cassa;Varie\n2026-03-06;Dominio;1234.5;Uscita;Aruba;Banca Nuova;Software\n30/02/2026;Data finta;10;Uscita;Fantasma 1;Conto Fantasma;Cat Fantasma\n2026-03-16;Ambiguo;1.234;Uscita;Fantasma 2;Conto Fantasma;Cat Fantasma\n2026-03-17;Lettere;12abc;Uscita;Fantasma 3;Conto Fantasma;Cat Fantasma\n2026-03-18;Tre decimali;1,234;Uscita;Fantasma 4;Conto Fantasma;Cat Fantasma\n2026-03-19;Negativo;-5;Uscita;Fantasma 5;Conto Fantasma;Cat Fantasma\n2026-03-20;Enorme;12345678901;Uscita;Fantasma 6;Conto Fantasma;Cat Fantasma\n0000-01-01;Anno zero;5;Uscita;Fantasma 7;Conto Fantasma;Cat Fantasma\n' > "$T/misto.csv"
PRIMA=$(conta "$UID_")
eq "anteprima: 200" "200" "$(imp "$UT" "$T/misto.csv" 1)"
eq "anteprima: 3 movimenti, 7 righe saltate, totali in testo" "True|3|7|1234.50|1241.00" \
  "$(py "print(d['anteprima'],d['stats']['movimenti_importati'],d['stats']['errori'],d['totali']['entrate'],d['totali']['uscite'],sep='|')")"
eq "anteprima: create 3 controparti, 2 conti (Cassa non e' Cassa Rurale)" "3|2" "$(py "e=d['dettagli']['entità_create'];print(e['anagrafiche'],e['conti'],sep='|')")"
eq "anteprima: i motivi delle righe saltate" "True|True|True|True|True|True|True" "$(py "w=' '.join(d['stats']['warnings']);print(*[s in w for s in ['Riga 4: Data non valida','1.234 e\' ambiguo','non riconosciuto: 12abc','non riconosciuto: 1,234','negativo','troppo grande','Riga 10: Data non valida']],sep='|')")"
eq "anteprima: niente scritto" "$PRIMA" "$(conta "$UID_")"
eq "import: 200, 3 movimenti" "200|False|3" "$(imp "$UT" "$T/misto.csv")|$(py "print(d['anteprima'],d['stats']['movimenti_importati'],sep='|')")"
eq "import: righe nel database (giorno, importo, conto)" "2026-02-28 1234.50 Entrata Banca Nuova Vendite,2026-03-05 6.50 Uscita Cassa Varie,2026-03-06 1234.50 Uscita Banca Nuova Software" \
  "$(q "SELECT string_agg(to_char(m.data,'YYYY-MM-DD')||' '||m.importo||' '||m.tipo||' '||c.nome_banca||' '||m.categoria, ',' ORDER BY m.data) FROM movimenti m JOIN conti_correnti c ON c.id=m.conto_id WHERE m.user_id=$UID_")"
eq "import: somme del database uguali ai totali" "1234.50|1241.00" "$(q "SELECT sum(importo) FILTER (WHERE tipo='Entrata')||'|'||sum(importo) FILTER (WHERE tipo='Uscita') FROM movimenti WHERE user_id=$UID_")"
eq "import: nessun «Fantasma» (righe annullate per intero)" "0|0|0" \
  "$(q "SELECT (SELECT count(*) FROM anagrafiche WHERE user_id=$UID_ AND nome LIKE 'Fantasma%')||'|'||(SELECT count(*) FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Conto Fantasma')||'|'||(SELECT count(*) FROM categorie_movimenti WHERE user_id=$UID_ AND nome='Cat Fantasma')")"
eq "Cassa Rurale intatta" "0" "$(q "SELECT count(*) FROM movimenti WHERE conto_id=$RURALE")"
printf 'Data;Descrizione;Importo;Tipo;Anagrafica;Conto\n31/04/2026;No;10;Uscita;Solo errori;Conto Errori\n2026-01-01;No;abc;Uscita;Solo errori;Conto Errori\n' > "$T/errori.csv"
PRIMA=$(conta "$UID_")
eq "solo righe sbagliate: 200, 0 importati, niente creato" "200|0|$PRIMA" "$(imp "$UT" "$T/errori.csv")|$(py "print(d['stats']['movimenti_importati'])")|$(conta "$UID_")"
python3 -c "
import sys
r=['Data;Descrizione;Importo;Tipo']+['2026-01-01;x;1;Uscita']*10001
open(sys.argv[1],'w').write('\n'.join(r))" "$T/grande.csv"
eq "10001 righe: 400, niente scritto" "400|$PRIMA" "$(imp "$UT" "$T/grande.csv")|$(conta "$UID_")"
printf 'Descrizione;Importo\nx;1\n' > "$T/senza.csv"
eq "colonne obbligatorie mancanti: 400" "400" "$(imp "$UT" "$T/senza.csv")"
eq "V intatto dopo gli import di U" "1|1|1|0" "$(conta "$VID")"
eq "modello CSV scaricabile" "200" "$(hit "${AU[@]}" "$API/movimenti/template")"
# Due import insieme con la stessa controparte nuova (review U6b, P0 2): il secondo
# aspettava il primo sul vincolo UNIQUE(user_id, nome) e scartava le sue righe.
W="u6bc$SFX"; WT=$(reg_u "$W"); WID=$(q "SELECT id FROM utenti WHERE username='$W'")
for k in 1 2; do
  python3 -c "
import sys,json
# il secondo scrive controparte e conto nuovo con altre maiuscole (review U6b bis)
n,c=(('Concorrente srl','Conto Nuovo W') if '$k'=='1' else ('concorrente SRL','conto nuovo w'))
r=['Data;Descrizione;Importo;Tipo;Anagrafica;Conto']+['2026-04-%02d;Riga $k-%d;1,00;Uscita;%s;%s' % (1+i%28, i, n, c if i%2 else 'Banca W') for i in range(300)]
json.dump({'csvData':'\n'.join(r)},open(sys.argv[1],'w'))" "$T/conc$k.json"
done
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Banca W', 'W', 0, $WID)" >/dev/null
for k in 1 2; do
  curl -s --max-time 120 -o "$T/conc$k.out" -w "%{http_code}" -X POST -H "Authorization: Bearer $WT" "${JSON[@]}" "$API/movimenti/import" -d @"$T/conc$k.json" > "$T/conc$k.code" &
done
wait
eq "due import insieme: 200 e 200, 300 + 300 importati" "200|200|300|300" \
  "$(cat "$T/conc1.code")|$(cat "$T/conc2.code")|$(python3 -c "import json;print(json.load(open('$T/conc1.out'))['stats']['movimenti_importati'])" 2>/dev/null)|$(python3 -c "import json;print(json.load(open('$T/conc2.out'))['stats']['movimenti_importati'])" 2>/dev/null)"
eq "due import insieme (maiuscole diverse): 600 movimenti, una controparte e un conto nuovo, creati una volta" "600|1|1|1|1" \
  "$(q "SELECT (SELECT count(*) FROM movimenti WHERE user_id=$WID)||'|'||(SELECT count(*) FROM anagrafiche WHERE user_id=$WID AND lower(nome)='concorrente srl')||'|'||(SELECT count(*) FROM conti_correnti WHERE user_id=$WID AND lower(nome_banca)='conto nuovo w')")|$(python3 -c "import json;o=[json.load(open('$T/conc%d.out'%k))['dettagli']['entità_create'] for k in (1,2)];print(sum(e['anagrafiche'] for e in o),sum(e['conti'] for e in o),sep='|')" 2>/dev/null)"

echo
echo "=== B. categorie ==="
q "UPDATE anagrafiche SET categoria='Fornitori' WHERE user_id=$UID_ AND nome IN ('Bar Roma','Aruba')" >/dev/null
CM=$(curl -s -X POST "$API/categorie-movimenti" "${AU[@]}" "${JSON[@]}" -d '{"nome":"  Spesa casa ","tipo":"Uscita"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
eq "nome ripulito dagli spazi" "Spesa casa" "$(q "SELECT nome FROM categorie_movimenti WHERE id=$CM")"
eq "nome vuoto: 400" "400" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/categorie-movimenti/$CM" -d '{"nome":"   "}')"
VARIE=$(q "SELECT id FROM categorie_movimenti WHERE user_id=$UID_ AND nome='Varie'")
eq "Varie di U: 1 utilizzo (non conta quello di V)" "1" "$(hit "${AU[@]}" "$API/categorie-movimenti/$VARIE" >/dev/null; py "print(d['utilizzi'])")"
eq "rinomina Varie -> Bar e caffe': 200" "200" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/categorie-movimenti/$VARIE" -d "{\"nome\":\"Bar e caffe'\"}")"
eq "il movimento di U segue il nuovo nome, quello di V no" "Bar e caffe'|Varie" \
  "$(q "SELECT (SELECT categoria FROM movimenti WHERE user_id=$UID_ AND descrizione='Bar')||'|'||(SELECT categoria FROM movimenti WHERE user_id=$VID)")"
eq "rinomina su un nome esistente: 400" "400" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/categorie-movimenti/$VARIE" -d '{"nome":"Vendite"}')"
eq "eliminazione in uso: 400" "400" "$(hit -X DELETE "${AU[@]}" "$API/categorie-movimenti/$VARIE")"
VV=$(curl -s -X POST "$API/categorie-movimenti" "${AU[@]}" "${JSON[@]}" -d '{"nome":"Varie"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
eq "Varie nuova di U (V la usa): eliminabile" "200" "$(hit -X DELETE "${AU[@]}" "$API/categorie-movimenti/$VV")"
eq "V non tocca le categorie di U: 404" "404|404" "$(hit -X PUT "${AV[@]}" "${JSON[@]}" "$API/categorie-movimenti/$CM" -d '{"nome":"x"}')|$(hit -X DELETE "${AV[@]}" "$API/categorie-movimenti/$CM")"
eq "categoria di controparte: nella sua tabella" "201|1|0" \
  "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/categorie-anagrafiche" -d '{"nome":"Fornitori"}')|$(q "SELECT count(*) FROM categorie_anagrafiche WHERE user_id=$UID_ AND nome='Fornitori'")|$(q "SELECT count(*) FROM categorie_movimenti WHERE user_id=$UID_ AND nome='Fornitori'")"
CA=$(py "print(d['data']['id'])")
eq "Fornitori di U: 2 controparti (non conta quella di V)" "2" "$(hit "${AU[@]}" "$API/categorie-anagrafiche/$CA" >/dev/null; py "print(d['utilizzi'])")"
eq "elenco categorie di controparte: solo la sua" "Fornitori" "$(hit "${AU[@]}" "$API/categorie-anagrafiche" >/dev/null; py "print(','.join(c['nome'] for c in d))")"
hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/categorie-anagrafiche/$CA" -d '{"nome":"Fornitori abituali"}' >/dev/null
eq "rinomina: le controparti di U seguono, quella di V no" "2|Fornitori" \
  "$(q "SELECT (SELECT count(*) FROM anagrafiche WHERE user_id=$UID_ AND categoria='Fornitori abituali')||'|'||(SELECT categoria FROM anagrafiche WHERE user_id=$VID)")"
eq "categoria di controparte in uso: 400; disattivata: 200" "400|200|f" \
  "$(hit -X DELETE "${AU[@]}" "$API/categorie-anagrafiche/$CA")|$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/categorie-anagrafiche/$CA" -d '{"attiva":false}')|$(q "SELECT attiva FROM categorie_anagrafiche WHERE id=$CA")"
eq "tipologia: doppio (maiuscole) 400, rinomina su esistente 400" "201|400|400" \
  "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/tipologie" -d '{"nome":"Socio"}')|$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/tipologie" -d '{"nome":"socio"}')|$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/tipologie/$(q "SELECT id FROM tipologie_anagrafiche WHERE user_id=$UID_ AND nome='Cliente'")" -d '{"nome":"Socio"}')"
eq "nessun messaggio di PostgreSQL nelle risposte" "0" "$(grep -ciE 'duplicate key|violates|syntax error' "$T/body")"

echo
echo "=== C. copia di sicurezza ed export ==="
eq "copia: 200" "200" "$(hit "${AU[@]}" "$API/auth/backup/export")"
cp "$T/body" "$T/copia.json"
eq "copia: 3 movimenti, 3 conti" "3|3" "$(py "print(len(d['movimenti']),len(d['conti_correnti']))" | tr ' ' '|')"
PRIMA=$(conta "$UID_")
# Copia difettosa: un movimento su un conto che nella copia non c'e'.
python3 -c "import json;d=json.load(open('$T/copia.json'));d['movimenti'][0]['conto_id']=987654321;json.dump({'backupData':d,'mode':'replace'},open('$T/rotta.json','w'))"
eq "copia difettosa con «sostituisci»: 400 e dati intatti" "400|$PRIMA" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/auth/backup/import" -d @"$T/rotta.json")|$(conta "$UID_")"
eq "il motivo nella risposta, nessun dato cambiato" "True|1" "$(py "print('nessun dato' in d['error'], d['numero_errori'])" | tr ' ' '|')"
python3 -c "import json;d=json.load(open('$T/copia.json'));json.dump({'backupData':d,'mode':'merge'},open('$T/merge.json','w'))"
eq "aggiunta con nomi gia' presenti: 400 e dati intatti" "400|$PRIMA" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/auth/backup/import" -d @"$T/merge.json")|$(conta "$UID_")"
eq "modalita' sconosciuta: 400" "400" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/auth/backup/import" -d '{"backupData":{"metadata":{},"user":{}},"mode":"tutto"}')"
python3 -c "import json;d=json.load(open('$T/copia.json'));json.dump({'backupData':d,'mode':'replace'},open('$T/sost.json','w'))"
SOMME=$(q "SELECT sum(importo)||'|'||count(*) FROM movimenti WHERE user_id=$UID_")
eq "sostituisci con la propria copia: 200, stessi conteggi e somme" "200|$PRIMA|$SOMME" \
  "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/auth/backup/import" -d @"$T/sost.json")|$(conta "$UID_")|$(q "SELECT sum(importo)||'|'||count(*) FROM movimenti WHERE user_id=$UID_")"
eq "V intatto dopo il ripristino di U" "1|1|1|0" "$(conta "$VID")"
# Copia con un avviso che non entra (review U6b, P0 1): prima l'errore si ignorava e
# «sostituisci» confermava, cancellando gli avvisi di prima.
q "INSERT INTO alerts (user_id, titolo, messaggio) VALUES ($UID_, 'Avviso U', 'da tenere')" >/dev/null
hit "${AU[@]}" "$API/auth/backup/export" >/dev/null; cp "$T/body" "$T/copia2.json"
python3 -c "import json;d=json.load(open('$T/copia2.json'));d['alerts'][0]['titolo']=None;json.dump({'backupData':d,'mode':'replace'},open('$T/avviso.json','w'))"
PRIMA=$(conta "$UID_")
eq "copia con un avviso difettoso: 400, dati e avviso intatti" "400|$PRIMA|1" \
  "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/auth/backup/import" -d @"$T/avviso.json")|$(conta "$UID_")|$(q "SELECT count(*) FROM alerts WHERE user_id=$UID_ AND titolo='Avviso U'")"
eq "l'avviso fra i motivi, nessun messaggio pg" "True|False" "$(py "e=' '.join(d.get('errori',[]));print('Avviso' in e, 'violates' in e or 'null value' in e)" | tr ' ' '|')"
eq "export CSV di marzo: 200" "200" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/export/generate" -d '{"export_type":"commercialista","formato":"csv","data_inizio":"2026-03-01","data_fine":"2026-03-31","ordine":"asc"}')"
eq "export: 2 righe di marzo con i giorni del database" "2|True|True" \
  "$(python3 -c "
import csv,io
t=open('$T/body',encoding='utf-8-sig').read()
r=[l for l in csv.reader(io.StringIO(t),delimiter=';' if t.count(';')>t.count(',') else ',')]
d=[x for x in r if any('2026' in c for c in x)]
txt=' '.join(' '.join(x) for x in d)
print(len(d), ('05/03/2026' in txt or '2026-03-05' in txt), ('06/03/2026' in txt or '2026-03-06' in txt), sep='|')")"
eq "export senza ordine (predefiniti): 200" "200" "$(hit -X POST "${AV[@]}" "${JSON[@]}" "$API/export/generate" -d '{"export_type":"semplice","formato":"csv"}')"
eq "export di V: niente di U" "0" "$(hit -X POST "${AV[@]}" "${JSON[@]}" "$API/export/generate" -d '{"export_type":"commercialista","formato":"csv","data_inizio":"2026-03-01","data_fine":"2026-03-31"}' >/dev/null; grep -c 'Dominio\|Bar Roma' "$T/body")"

echo
echo "=== D. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
eq "nessun parseFloat/toFixed in src" "0" "$(cd "$D" && grep -rlE 'parseFloat|toFixed' src | wc -l | tr -d ' ')"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/frontend/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
printf 'Data;Descrizione;Importo;Tipo;Anagrafica;Conto\n2026-04-01;Affitto aprile;850,00;Uscita;Immobiliare Sole;Banca Nuova\n2026-04-02;Fattura 7;2.000,00;Entrata;Rossi srl;Banca Nuova\n31/04/2026;Errata;5;Uscita;Fantasma B;Banca Nuova\n' > "$T/browser.csv"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" UTENTE="$U" PW="$PW" CSV="$T/browser.csv" COPIA="$T/copia.json" \
  browser node "$R/scripts/smoke/lib/u6b-archivio-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== E. database dopo il browser ==="
eq "import dal browser: affitto e fattura, l'errata no" "2026-04-01 850.00 Uscita,2026-04-02 2000.00 Entrata|0" \
  "$(q "SELECT string_agg(to_char(data,'YYYY-MM-DD')||' '||importo||' '||tipo, ',' ORDER BY data) FROM movimenti WHERE user_id=$UID_ AND data >= '2026-04-01'")|$(q "SELECT count(*) FROM anagrafiche WHERE user_id=$UID_ AND nome='Fantasma B'")"
eq "categoria creata e rinominata dal browser, movimento al seguito" "Software e web|1" \
  "$(q "SELECT nome FROM categorie_movimenti WHERE user_id=$UID_ AND nome LIKE 'Software%'")|$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_ AND categoria='Software e web'")"
eq "categoria nuova dal browser: Assicurazioni, Uscita" "Uscita" "$(q "SELECT tipo FROM categorie_movimenti WHERE user_id=$UID_ AND nome='Assicurazioni'")"
eq "V intatto" "1|1|1|0" "$(conta "$VID")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
