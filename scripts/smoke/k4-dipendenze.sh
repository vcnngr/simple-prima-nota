#!/usr/bin/env bash
# Smoke test del blocco K4: dipendenze.
#
#   A. `xlsx` (SheetJS 0.18.5, vulnerabilita' high senza correzione su npm) non e'
#      piu' una dipendenza ne' e' richiesto dal codice; nodemailer >= 10.0.12;
#      Node 24 nelle immagini; npm audit del backend pulito, del frontend senza
#      critical e senza dipendenze dirette vulnerabili fuori da quelle note.
#   B. backend/utils/xlsx.js scrive file che un lettore indipendente (openpyxl)
#      apre: fogli, intestazioni, numeri, date, booleani, testo che sembra una
#      formula ma resta testo, caratteri speciali, larghezze.
#   C. controllo degli allegati .xlsx senza parser di terzi: accetta workbook
#      veri (deflate e stored, con prefisso di namespace) e rifiuta workbook senza
#      fogli, CRC sbagliato, workbook enorme, voci doppie, macro.
#   D. esportazioni xlsx vere via HTTP (movimenti, conti, anagrafiche, report,
#      export, export dello studio) aperte con openpyxl; un export ricaricato
#      come allegato della chat e' accettato.
#   E. nodemailer 10 consegna davvero (reset password -> Mailpit).
#
#   API=http://localhost:3001/api DB_CONTAINER=... MAIL_API=http://localhost:8025 \
#     ./scripts/smoke/k4-dipendenze.sh
#
# Richiede node, npm, python3, uv (openpyxl) e il backend avviato sul checkout.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
MAIL_API="${MAIL_API:-http://localhost:8025}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
j()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")
# openpyxl in un ambiente usa e getta: lettore indipendente dal nostro codice.
leggi_xlsx() { uv run -q --with openpyxl python3 "$T/leggi.py" "$@" 2>&1 | tail -1; }

cat > "$T/leggi.py" <<'EOF'
import sys, json, openpyxl, datetime
try:
    wb = openpyxl.load_workbook(sys.argv[1])
except Exception as e:
    print("illeggibile:" + type(e).__name__); sys.exit(0)
out = {}
for ws in wb.worksheets:
    righe = [[(c.value.isoformat() if isinstance(c.value, (datetime.date, datetime.datetime)) else c.value) for c in r] for r in ws.iter_rows()]
    tipi = [[c.data_type for c in r] for r in ws.iter_rows()]
    larg = {k: v.width for k, v in ws.column_dimensions.items() if v.customWidth}
    out[ws.title] = {"righe": righe, "tipi": tipi, "larghezze": larg}
print(json.dumps(out, ensure_ascii=False))
EOF

echo "=== A. dipendenze ==="
eq "xlsx non e' nel package.json del backend" "no" "$(grep -q '"xlsx"' "$R/backend/package.json" && echo si || echo no)"
eq "nessun require('xlsx') nel backend" "0" "$(grep -rlE "require\(['\"]xlsx['\"]\)" "$R/backend" --include=*.js --exclude-dir=node_modules | wc -l | tr -d ' ')"
NM=$(cd "$R/backend" && node -p "require('nodemailer/package.json').version" 2>/dev/null || echo -)
eq "nodemailer installato >= 10.0.12" "si" "$(node -e "const [a,b,c]=process.argv[1].split('.').map(Number);console.log(a>10||(a===10&&(b>0||c>=12))?'si':'no')" "$NM" 2>/dev/null || echo no)"
eq "Node 24 nelle immagini di backend e frontend" "2" "$(grep -hc 'FROM docker.io/library/node:24-alpine' "$R/backend/Dockerfile" "$R/web/Dockerfile" | paste -sd+ - | bc)"
mkdir -p "$T/audit" && cp "$R/backend/package.json" "$T/audit/"
(cd "$T/audit" && npm i --package-lock-only --ignore-scripts --no-fund >/dev/null 2>&1)
# Conta quello che finisce nell'immagine (--omit=dev nel Dockerfile). jest e
# nodemon (solo sviluppo) hanno avvisi senza correzione a monte dal 10/2026.
eq "npm audit backend, produzione: 0 vulnerabilita'" "0" "$(cd "$T/audit" && npm audit --omit=dev --json 2>/dev/null | j "['metadata']['vulnerabilities']['total']")"
eq "immagine del backend senza dipendenze di sviluppo" "1" "$(grep -c '^RUN npm install --omit=dev' "$R/backend/Dockerfile")"
# Dal blocco U6d il frontend e' web/ (Vite): react-scripts e react-router-dom 6
# del vecchio frontend/ sono usciti con lui.
eq "frontend/ (CRA) tolto" "no" "$([ -e "$R/frontend" ] && echo si || echo no)"
(cd "$R/web" && npm audit --json 2>/dev/null) > "$T/fe-audit.json"
eq "npm audit web/: 0 vulnerabilita'" "0" "$(j "['metadata']['vulnerabilities']['total']" < "$T/fe-audit.json")"
eq "immagine del frontend: npm ci dal lockfile" "1" "$(grep -c '^RUN npm ci' "$R/web/Dockerfile")"

echo
echo "=== B. scrittore xlsx ==="
(cd "$R/backend" && node -e '
const { cartellaXlsx } = require("./utils/xlsx");
const b = cartellaXlsx([
  { nome: "Dati", larghezze: true, righe: [
    { Data: new Date(2026, 8, 29), Importo: 12.5, Testo: "=SOMMA(A1:A2) <&> \"q\" è€", Ok: true, Vuoto: null },
    { Data: new Date(2026, 0, 2, 14, 30), Importo: "7.25", Extra: "solo qui" } ] },
  { nome: "Info/[prova]:*?", righe: [{ a: 1 }] },
  { nome: "Dati", righe: [] } ]);
require("fs").writeFileSync(process.argv[1], b);' "$T/b.xlsx") 2>"$T/b.err"
B=$(leggi_xlsx "$T/b.xlsx")
bq() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);print($1)" "$B" 2>/dev/null || echo "-"; }
eq "openpyxl apre il file" "si" "$(bq "'si' if isinstance(d,dict) else 'no'")"
eq "nomi dei fogli ripuliti e unici" "Dati|Info  prova|Dati_2" "$(bq "'|'.join(d.keys())")"
eq "intestazioni nell'ordine, chiavi di tutte le righe" "Data,Importo,Testo,Ok,Vuoto,Extra" "$(bq "','.join(d['Dati']['righe'][0])")"
eq "data come data, ora compresa" "2026-09-29T00:00:00|2026-01-02T14:30:00" "$(bq "d['Dati']['righe'][1][0]+'|'+d['Dati']['righe'][2][0]")"
eq "numero come numero, stringa numerica come testo" "12.5 n|7.25 s" "$(bq "str(d['Dati']['righe'][1][1])+' '+d['Dati']['tipi'][1][1]+'|'+d['Dati']['righe'][2][1]+' '+d['Dati']['tipi'][2][1]")"
eq "testo che sembra formula resta testo, caratteri intatti" "=SOMMA(A1:A2) <&> \"q\" è€ s" "$(bq "d['Dati']['righe'][1][2]+' '+d['Dati']['tipi'][1][2]")"
eq "booleano, cella vuota" "True None" "$(bq "str(d['Dati']['righe'][1][3])+' '+str(d['Dati']['righe'][1][4])")"
eq "larghezze delle colonne impostate" "si" "$(bq "'si' if len(d['Dati']['larghezze'])==6 else d['Dati']['larghezze']")"

echo
echo "=== C. controllo degli allegati .xlsx ==="
cat > "$T/zip.py" <<'EOF'
import sys, zipfile, zlib, struct
CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
def wb(fogli, ns=''):
    p = ns + ':' if ns else ''
    x = f'xmlns:{ns}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' if ns else 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    return f'<?xml version="1.0"?><{p}workbook {x}><{p}sheets>' + ''.join(f'<{p}sheet name="{n}" sheetId="{i+1}"/>' for i, n in enumerate(fogli)) + f'</{p}sheets></{p}workbook>'
def scrivi(nome, voci, metodo=zipfile.ZIP_DEFLATED):
    with zipfile.ZipFile(nome, 'w', metodo) as z:
        for n, c in voci:
            z.writestr(n, c)
d = sys.argv[1]
base = [('[Content_Types].xml', CT), ('_rels/.rels', '<Relationships/>')]
scrivi(d + '/deflate.xlsx', base + [('xl/workbook.xml', wb(['Foglio1']))])
scrivi(d + '/stored.xlsx', base + [('xl/workbook.xml', wb(['Foglio1']))], zipfile.ZIP_STORED)
scrivi(d + '/ns.xlsx', base + [('xl/workbook.xml', wb(['Uno', 'Due'], 'x'))])
scrivi(d + '/senzafogli.xlsx', base + [('xl/workbook.xml', wb([]))])
scrivi(d + '/enorme.xlsx', base + [('xl/workbook.xml', wb(['A']) + ' ' * (2 * 1024 * 1024))])
scrivi(d + '/macro.xlsx', base + [('xl/workbook.xml', wb(['A'])), ('xl/vbaProject.bin', 'x')])
import warnings; warnings.simplefilter('ignore')
scrivi(d + '/doppie.xlsx', base + [('xl/workbook.xml', wb(['A'])), ('xl/workbook.xml', wb(['B']))])
# CRC sbagliato nella voce del workbook (stored: si cambia un byte del contenuto).
b = bytearray(open(d + '/stored.xlsx', 'rb').read())
i = b.index(b'Foglio1'); b[i] = ord('G')
open(d + '/crc.xlsx', 'wb').write(bytes(b))
EOF
python3 "$T/zip.py" "$T"
cp "$T/b.xlsx" "$T/nostro.xlsx" 2>/dev/null
C=$(cd "$R/backend" && node -e '
const A = require("./services/AllegatiService"); const fs = require("fs");
const r = process.argv.slice(1).map(f => { try { return A.verifica({ originalname: "x.xlsx", buffer: fs.readFileSync(f) }).tipo; } catch (e) { return "no"; } });
console.log(r.join(","));' "$T/deflate.xlsx" "$T/stored.xlsx" "$T/ns.xlsx" "$T/nostro.xlsx" "$T/senzafogli.xlsx" "$T/crc.xlsx" "$T/enorme.xlsx" "$T/doppie.xlsx" "$T/macro.xlsx" 2>&1)
eq "accettati: deflate, stored, namespace, prodotto da noi" "xlsx,xlsx,xlsx,xlsx" "$(echo "$C" | cut -d, -f1-4)"
eq "rifiutati: senza fogli, CRC, enorme, voci doppie, macro" "no,no,no,no,no" "$(echo "$C" | cut -d, -f5-9)"

echo
echo "=== D. esportazioni via HTTP ==="
U="k4u$SFX"; C4="k4c$SFX"; DESCR="K4mov$SFX"
UT=$(curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$U\",\"email\":\"$U@t.it\",\"password\":\"$PW\"}" | j "['token']")
AU=(-H "Authorization: Bearer $UT")
CONTO=$(curl -s -X POST "$API/conti-bancari" "${AU[@]}" "${JSON[@]}" -d "{\"nome_banca\":\"K4banca$SFX\",\"intestatario\":\"K4\",\"saldo_iniziale\":100}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id') or d.get('data',{}).get('id') or '-')" 2>/dev/null)
ANA=$(curl -s -X POST "$API/anagrafiche" "${AU[@]}" "${JSON[@]}" -d "{\"nome\":\"K4ana$SFX\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id') or d.get('data',{}).get('id') or '-')" 2>/dev/null)
curl -s -o /dev/null -X POST "$API/movimenti" "${AU[@]}" "${JSON[@]}" \
  -d "{\"data\":\"2026-09-15\",\"conto_id\":$CONTO,\"anagrafica_id\":$ANA,\"descrizione\":\"$DESCR\",\"importo\":42.5,\"tipo\":\"Entrata\"}"
scarica() {  # scarica <descrizione> <file> <foglio> <testo atteso> <curl args...>
  local desc="$1" f="$2" foglio="$3" atteso="$4"; shift 4
  local st ct; st=$(curl -s -o "$T/$f" -w "%{http_code} %{content_type}" "$@")
  ct="${st#* }"; st="${st%% *}"
  if [ "$st" != 200 ] || [ "${ct#application/vnd.openxmlformats-officedocument.spreadsheetml.sheet}" = "$ct" ]; then
    ko "$desc" "200 xlsx" "$st $ct — $(head -c 150 "$T/$f")"; return; fi
  local x; x=$(leggi_xlsx "$T/$f")
  eq "$desc: openpyxl apre, foglio $foglio, contiene $atteso" "si" \
    "$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);print('si' if sys.argv[2] in d and sys.argv[3] in json.dumps(d,ensure_ascii=False) else sys.argv[1][:200])" "$x" "$foglio" "$atteso" 2>/dev/null || echo "$x")"
}
scarica "GET /movimenti/export xlsx" mov.xlsx "Prima Nota" "$DESCR" "$API/movimenti/export?formato=xlsx" "${AU[@]}"
scarica "GET /conti-bancari/export xlsx" conti.xlsx "Conti Bancari" "K4banca$SFX" "$API/conti-bancari/export?formato=xlsx" "${AU[@]}"
scarica "GET /anagrafiche/export xlsx" ana.xlsx "Anagrafiche" "K4ana$SFX" "$API/anagrafiche/export?formato=xlsx" "${AU[@]}"
scarica "GET /reports/estratto-conto xlsx" rep.xlsx "Report" "$DESCR" "$API/reports/estratto-conto?formato=xlsx&data_inizio=2026-09-01&data_fine=2026-09-30" "${AU[@]}"
scarica "POST /export/generate xlsx (due fogli)" gen.xlsx "Informazioni" "$DESCR" -X POST "$API/export/generate" "${AU[@]}" "${JSON[@]}" \
  -d '{"export_type":"semplice","tutto_storico":true,"formato":"xlsx","ordina_per":"data","ordine":"desc"}'

CT=$(curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$C4\",\"email\":\"$C4@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio K4\",\"partita_iva\":\"12345678901\"}" | j "['token']")
curl -s -o /dev/null -X POST "$API/commercialisti/richieste" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$U\"}"
COLL=$(curl -s "$API/utenti/collegamenti" "${AU[@]}" | python3 -c "
import sys,json;d=json.load(sys.stdin);l=d if isinstance(d,list) else (d.get('collegamenti') or d.get('data') or [])
print(next((c['id'] for c in l if c.get('stato')=='in_attesa'),'-'))" 2>/dev/null)
curl -s -o /dev/null -X PUT "$API/utenti/collegamenti/$COLL/accetta" "${AU[@]}" "${JSON[@]}" -d '{}'
UID_=$(curl -s "$API/auth/profile" "${AU[@]}" | j "['id']")
scarica "POST export dello studio xlsx" stu.xlsx "Movimenti" "$DESCR" -X POST "$API/commercialisti/clienti/$UID_/export" \
  -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"export_type":"semplice","formato":"xlsx","data_inizio":"2026-01-01","data_fine":"2026-12-31"}'

eq "export ricaricato come allegato della chat: accettato" "201" \
  "$(curl -s -o "$T/up" -w '%{http_code}' -X POST "$API/messaggi/allegati?collegamentoId=$COLL" "${AU[@]}" -F "file=@$T/mov.xlsx;filename=prima_nota.xlsx")"
eq "workbook con CRC sbagliato come allegato: rifiutato" "415" \
  "$(curl -s -o "$T/up" -w '%{http_code}' -X POST "$API/messaggi/allegati?collegamentoId=$COLL" "${AU[@]}" -F "file=@$T/crc.xlsx;filename=x.xlsx")"

echo
echo "=== E. nodemailer ==="
conta_mail() {
  curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json;d=json.load(sys.stdin);print(sum(1 for m in d.get('messages',[]) if m.get('Subject','').startswith('Reimposta la password') and any(a['Address'].lower()=='$U@t.it' for a in m.get('To',[]))))" 2>/dev/null || echo "-"; }
curl -s -o /dev/null -X POST "$API/auth/password-dimenticata" "${JSON[@]}" -H "X-Forwarded-For: 10.4.0.$((RANDOM % 250))" -d "{\"identificativo\":\"$U\"}"
N=0; for _ in $(seq 1 30); do N=$(conta_mail); [ "$N" = 1 ] && break; sleep 0.5; done
eq "mail di reset consegnata a Mailpit" "1" "$N"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
