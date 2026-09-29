#!/usr/bin/env bash
# Smoke test della chat di lavoro (blocco W5, migration 007).
#
# Verifica che:
#   * gli allegati si accettino o rifiutino per CONTENUTO ed estensione, non per
#     il tipo dichiarato dal browser; dimensione e quota per collegamento;
#   * un allegato si scarichi solo dal proprio collegamento, byte per byte, come
#     download; il download del commercialista finisca nel registro (fail-closed);
#   * il nome scelto da chi carica non tocchi mai il disco;
#   * un movimento si possa citare solo se e' del cliente e dentro l'ambito, e
#     che il commercialista non ne veda il contenuto se esce dall'ambito dopo;
#   * le richieste di chiarimento passino aperta <-> risolta una volta sola;
#   * eliminato l'account, i file spariscano anche dal disco.
#
# Il backend deve girare con ALLEGATI_DIR leggibile da qui, quota bassa e
# pulizia rapida, per esempio:
#   ALLEGATI_DIR=/tmp/pn-w5-allegati ALLEGATI_QUOTA_BYTES=3145728 ALLEGATI_PULIZIA_MS=500
#
#   API=http://localhost:3070/api DB_CONTAINER=pn-w5-db ALLEGATI_DIR=/tmp/pn-w5-allegati \
#     ./scripts/smoke/w5-chat-lavoro.sh
#
# Esce 1 se anche un solo caso fallisce.

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
ALLEGATI_DIR="${ALLEGATI_DIR:-}"
SFX="${SFX:-$(date +%s)$RANDOM}"
T=$(mktemp -d /tmp/w5smoke.XXXX)

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -tA "$@"; }
j()   { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s --max-time 20 -o $T/body -w "%{http_code}" "$@"; }
body(){ head -c 200 $T/body; }
JSON=(-H "Content-Type: application/json")
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got
  if [ "$1" = up ]; then shift; got=$(up "$@"); else got=$(hit "$@"); fi
  if [ "$got" = "$atteso" ]; then ok "$desc"; else ko "$desc" "HTTP $atteso" "HTTP $got — $(body)"; fi
}
file_su_disco() { find "$ALLEGATI_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '; }
attendi() {
  local atteso="$1"; shift; local v
  for _ in $(seq 1 30); do v=$("$@"); [ "$v" = "$atteso" ] && { echo "$v"; return; }; sleep 0.5; done
  echo "$v"
}
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
allegati_coll() { psql_q -c "SELECT count(*) FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$1;"; }
righe_allegato() { psql_q -c "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='allegato';"; }

# --- file di prova -------------------------------------------------------------
printf '%%PDF-1.4\n%% W5-PDF-%s\n1 0 obj <<>> endobj\ntrailer <<>>\n%%%%EOF\n' "$SFX" > $T/doc.pdf
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' > $T/img.png
printf '\xff\xd8\xff\xe0\x00\x10JFIF' > $T/img.jpg
printf 'data;descrizione;importo\n2025-06-01;Fattura è;100,00\n' > $T/estratto.csv
printf 'MZ\x90\x00\x03\x00\x00\x00 finto eseguibile' > $T/malevolo.exe
printf '<html><script>alert(1)</script></html>\n' > $T/pagina.html
printf 'a;b\x00c\n' > $T/binario.csv
printf 'PK\x03\x04 zip qualunque' > $T/archivio.zip
# Non e' uno zip: solo la firma e i due nomi che un xlsx ha in directory centrale.
printf 'PK\x03\x04 xl/workbook.xml [Content_Types].xml' > $T/finto.xlsx
(cd "$(dirname "$0")/../../backend" && node -e "
// K4: niente piu' SheetJS; il foglio vero lo scrive utils/xlsx.js.
const { cartellaXlsx } = require('./utils/xlsx');
require('fs').writeFileSync('$T/foglio.xlsx', cartellaXlsx([{ nome: 'F', righe: [{ data: '2025-06-01', importo: 100 }] }]));")
# Zip validi ma non fogli di lavoro: due voci vuote dai nomi giusti piu' un
# eseguibile; un xlsx vero con un eseguibile accanto; un xlsx con macro.
python3 - "$T" <<'PY2'
import sys, zipfile, shutil
t = sys.argv[1]
with zipfile.ZipFile(t + '/zipfinto.xlsx', 'w') as z:
    z.writestr('[Content_Types].xml', ''); z.writestr('xl/workbook.xml', ''); z.writestr('payload.exe', 'MZ')
for nome, voce in (('conpayload', 'payload.exe'), ('macro', 'xl/vbaProject.bin')):
    shutil.copy(t + '/foglio.xlsx', t + '/' + nome + '.xlsx')
    with zipfile.ZipFile(t + '/' + nome + '.xlsx', 'a') as z: z.writestr(voce, 'MZ')
# Voci estranee nascoste alla directory centrale (revisione W5-fix2):
#  - eseguibile aggiunto e contatori dell'EOCD scalati di uno;
#  - voce locale inserita prima della directory, che nessun record nomina;
#  - byte in coda nel commento dell'EOCD.
import io, struct
shutil.copy(t + '/foglio.xlsx', t + '/eocd.xlsx')
with zipfile.ZipFile(t + '/eocd.xlsx', 'a') as z: z.writestr('payload.exe', 'MZ' * 100)
b = bytearray(open(t + '/eocd.xlsx', 'rb').read()); e = len(b) - 22
n = struct.unpack_from('<H', b, e + 10)[0]; struct.pack_into('<HH', b, e + 8, n - 1, n - 1)
open(t + '/eocd.xlsx', 'wb').write(b)
d = bytearray(open(t + '/foglio.xlsx', 'rb').read()); e = len(d) - 22
cen = struct.unpack_from('<I', d, e + 16)[0]
h = io.BytesIO()
with zipfile.ZipFile(h, 'w') as z: z.writestr('payload.exe', 'MZ' * 100)
hb = h.getvalue(); loc = hb[:struct.unpack_from('<I', hb, len(hb) - 6)[0]]
o = d[:cen] + loc + d[cen:]; struct.pack_into('<I', o, len(o) - 6, cen + len(loc))
open(t + '/nascosta.xlsx', 'wb').write(o)
c = bytearray(open(t + '/foglio.xlsx', 'rb').read()); struct.pack_into('<H', c, len(c) - 2, 6)
open(t + '/commento.xlsx', 'wb').write(c + b'MZ\x90\x00XX')
# Zip64 (revisione W5-fix3). Sull'ultima voce per offset, in locale e in centrale:
#  - dimensione originale = sentinella 0xFFFFFFFF + blocco extra 0x0001 (zip64 valido);
#  - solo il blocco extra 0x0001, dimensioni a 32 bit intatte;
# e un'intestazione locale con dimensione originale diversa dalla directory.
def voci_cen(b):
    e = len(b) - 22; p = struct.unpack_from('<I', b, e + 16)[0]; r = []
    while p < e:
        nl, xl, cl = struct.unpack_from('<HHH', b, p + 28)
        r.append((p, struct.unpack_from('<I', b, p + 42)[0], nl, xl)); p += 46 + nl + xl + cl
    return r
def zip64(dst, sentinella):
    b = bytearray(open(t + '/foglio.xlsx', 'rb').read()); e = len(b) - 22
    cen, dim = struct.unpack_from('<I', b, e + 16)[0], struct.unpack_from('<I', b, e + 12)[0]
    cp, lp, cnl, cxl = max(voci_cen(b), key=lambda r: r[1])
    x = struct.pack('<HHQ', 1, 8, struct.unpack_from('<I', b, cp + 24)[0])
    lnl, lxl = struct.unpack_from('<HH', b, lp + 26); i = lp + 30 + lnl + lxl
    b[i:i] = x; struct.pack_into('<H', b, lp + 28, lxl + len(x))
    if sentinella: struct.pack_into('<I', b, lp + 22, 0xFFFFFFFF)
    cen += len(x); e += len(x); cp += len(x)
    i = cp + 46 + cnl + cxl; b[i:i] = x; struct.pack_into('<H', b, cp + 30, cxl + len(x))
    if sentinella: struct.pack_into('<I', b, cp + 24, 0xFFFFFFFF)
    e += len(x); struct.pack_into('<II', b, e + 12, dim + len(x), cen)
    open(t + '/' + dst, 'wb').write(b)
zip64('zip64.xlsx', True)
zip64('zip64extra.xlsx', False)
b = bytearray(open(t + '/foglio.xlsx', 'rb').read())
cp, lp, _, _ = max(voci_cen(b), key=lambda r: r[1])
struct.pack_into('<I', b, lp + 22, struct.unpack_from('<I', b, lp + 22)[0] + 1)
open(t + '/locale.xlsx', 'wb').write(b)
PY2
head -c 11534336 /dev/zero | tr '\0' 'a' > $T/grande.csv       # 11 MB
{ printf '%%PDF-1.4\n'; head -c 1258291 /dev/zero; } > $T/medio.pdf   # 1,2 MB

up() {  # up <token> <query> <file> [nome] [campi extra...]
  local tok="$1" q="$2" f="$3" nome="${4:-$(basename "$3")}"; shift 4 2>/dev/null || shift 3
  hit -X POST "$API/messaggi/allegati?$q" -H "Authorization: Bearer $tok" -F "file=@$f;filename=$nome" "$@"
}

echo "=== setup (suffisso $SFX) ==="
reg_u() { curl -s -X POST $API/auth/register "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\"}" | j "['token']"; }
reg_c() { curl -s -X POST $API/commercialisti/register "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"$2\"}" | j "['token']"; }
U="w5u$SFX"; U2="w5v$SFX"; C="w5c$SFX"; C2="w5d$SFX"
UT=$(reg_u $U); UT2=$(reg_u $U2); CT=$(reg_c $C "Studio W5"); CT2=$(reg_c $C2 "Studio Estraneo")
CLI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT" | j "['id']")
CLI2=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT2" | j "['id']")

conto() { curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"nome_banca\":\"$2\",\"intestatario\":\"W5\",\"saldo_iniziale\":100}" >/dev/null
  curl -s "$API/conti-bancari" -H "Authorization: Bearer $1" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin) if c['nome_banca']=='$2'][0])"; }
mov() { curl -s -X POST $API/movimenti -H "Authorization: Bearer $1" "${JSON[@]}" \
  -d "{\"data\":\"$2\",\"conto_id\":$3,\"descrizione\":\"$4\",\"importo\":10,\"tipo\":\"Uscita\"}" >/dev/null
  psql_q -c "SELECT id FROM movimenti WHERE descrizione='$4';"; }
CONTO_OK=$(conto "$UT" "W5 Ammessa"); CONTO_NO=$(conto "$UT" "W5 Negata"); CONTO_ALTRO=$(conto "$UT2" "W5 Altrui")
M_OK=$(mov "$UT" 2025-06-01 $CONTO_OK "W5-DENTRO-$SFX")
M_CONTO=$(mov "$UT" 2025-06-02 $CONTO_NO "W5-FUORI-CONTO-$SFX")
M_DATA=$(mov "$UT" 2024-06-01 $CONTO_OK "W5-FUORI-DATA-$SFX")
M_ALTRO=$(mov "$UT2" 2025-06-01 $CONTO_ALTRO "W5-ALTRUI-$SFX")
M_BORDO=$(mov "$UT" 2025-01-01 $CONTO_OK "W5-BORDO-$SFX")
M_VIGILIA=$(mov "$UT" 2024-12-31 $CONTO_OK "W5-VIGILIA-$SFX")

collega() {  # collega <token studio> <username> <token cliente> <ambito json>
  curl -s -X POST $API/commercialisti/richieste -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$2\"}" >/dev/null
  local id; id=$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $3" | j "['collegamenti'][0]['id']")
  curl -s -X PUT "$API/utenti/collegamenti/$id/accetta" -H "Authorization: Bearer $3" "${JSON[@]}" -d "$4" >/dev/null
  echo "$id"; }
COLL=$(collega "$CT" "$U" "$UT" "{\"ambito_dal\":\"2025-01-01\",\"conti_ammessi\":[$CONTO_OK]}")
COLL2=$(collega "$CT" "$U2" "$UT2" '{}')
QU="collegamentoId=$COLL"; QC="userId=$CLI"
echo "cliente=$CLI collegamento=$COLL collegamento2=$COLL2 movimenti ok=$M_OK conto=$M_CONTO data=$M_DATA altrui=$M_ALTRO"
[ -n "$ALLEGATI_DIR" ] || echo "  (ALLEGATI_DIR non impostato: i controlli su disco falliranno)"
DISCO0=$(file_su_disco)

echo
echo "=== A. allegati ammessi ==="
assert_http "pdf -> 201" 201 up "$UT" "$QU" $T/doc.pdf doc.pdf -F "messaggio=ecco la fattura"
A_PDF=$(j "['messaggio']['allegati'][0]['id']" < $T/body)
eq "il tipo e' quello del contenuto" "application/pdf" "$(j "['messaggio']['allegati'][0]['mime']" < $T/body)"
eq "sha256 registrato = sha256 del file" "$(sha $T/doc.pdf)" "$(psql_q -c "SELECT sha256 FROM allegati_messaggio WHERE id=$A_PDF;")"
assert_http "png -> 201" 201 up "$UT" "$QU" $T/img.png
assert_http "jpg -> 201" 201 up "$UT" "$QU" $T/img.jpg
assert_http "csv utf-8 -> 201" 201 up "$UT" "$QU" $T/estratto.csv
assert_http "xlsx -> 201" 201 up "$UT" "$QU" $T/foglio.xlsx
eq "cinque file su disco" "$((DISCO0+5))" "$(file_su_disco)"
assert_http "anche lo studio allega (testo vuoto)" 201 up "$CT" "$QC" $T/doc.pdf risposta.pdf
DISCO1=$(file_su_disco)

echo
echo "=== B. allegati rifiutati: contenuto, estensione, dimensione ==="
N0=$(allegati_coll $COLL)
assert_http "eseguibile rinominato .pdf -> 415" 415 up "$UT" "$QU" $T/malevolo.exe fattura.pdf -F "x=1"
assert_http "eseguibile dichiarato application/pdf -> 415" 415 \
  -X POST "$API/messaggi/allegati?$QU" -H "Authorization: Bearer $UT" -F "file=@$T/malevolo.exe;filename=f.pdf;type=application/pdf"
assert_http "html rinominato .csv -> 415" 415 up "$UT" "$QU" $T/pagina.html pagina.csv
assert_http "csv con byte nulli -> 415" 415 up "$UT" "$QU" $T/binario.csv
assert_http "zip qualunque rinominato .xlsx -> 415" 415 up "$UT" "$QU" $T/archivio.zip archivio.xlsx
assert_http "firma zip + nomi xlsx senza struttura zip -> 415" 415 up "$UT" "$QU" $T/finto.xlsx finto.xlsx
assert_http "zip valido con voci xlsx vuote e un eseguibile -> 415" 415 up "$UT" "$QU" $T/zipfinto.xlsx zipfinto.xlsx
assert_http "xlsx vero con un eseguibile accanto -> 415" 415 up "$UT" "$QU" $T/conpayload.xlsx conpayload.xlsx
assert_http "xlsx con macro -> 415" 415 up "$UT" "$QU" $T/macro.xlsx macro.xlsx
assert_http "eseguibile oltre il conteggio dell'EOCD -> 415" 415 up "$UT" "$QU" $T/eocd.xlsx eocd.xlsx
assert_http "voce locale che la directory non nomina -> 415" 415 up "$UT" "$QU" $T/nascosta.xlsx nascosta.xlsx
assert_http "byte in coda nel commento dell'EOCD -> 415" 415 up "$UT" "$QU" $T/commento.xlsx commento.xlsx
assert_http "zip64 valido (sentinella + extra 0x0001) -> 415" 415 up "$UT" "$QU" $T/zip64.xlsx zip64.xlsx
assert_http "blocco extra zip64 con dimensioni a 32 bit -> 415" 415 up "$UT" "$QU" $T/zip64extra.xlsx zip64extra.xlsx
assert_http "intestazione locale diversa dalla directory -> 415" 415 up "$UT" "$QU" $T/locale.xlsx locale.xlsx
assert_http "jpg con estensione .png -> 415" 415 up "$UT" "$QU" $T/img.jpg foto.png
assert_http "pdf con estensione .exe -> 415" 415 up "$UT" "$QU" $T/doc.pdf doc.exe
assert_http "11 MB -> 413" 413 up "$UT" "$QU" $T/grande.csv
assert_http "nessun file -> 400" 400 -X POST "$API/messaggi/allegati?$QU" -H "Authorization: Bearer $UT" -F "messaggio=solo testo"
eq "i rifiuti non lasciano righe" "$N0" "$(allegati_coll $COLL)"
eq "ne' file su disco" "$DISCO1" "$(file_su_disco)"

echo
echo "=== C. quota per collegamento ==="
assert_http "1,2 MB -> 201" 201 up "$UT" "$QU" $T/medio.pdf
assert_http "altri 1,2 MB -> 201" 201 up "$UT" "$QU" $T/medio.pdf
assert_http "oltre i 3 MB del collegamento -> 413" 413 up "$UT" "$QU" $T/medio.pdf
assert_http "un altro collegamento ha la sua quota" 201 up "$UT2" "collegamentoId=$COLL2" $T/medio.pdf
A_ALTRO=$(j "['messaggio']['allegati'][0]['id']" < $T/body)

echo
echo "=== D. il nome non tocca il disco ==="
assert_http "nome con percorso e virgolette -> 201" 201 up "$UT" "$QU" $T/doc.pdf '../../etc/pass"wd.pdf'
A_NOME=$(j "['messaggio']['allegati'][0]['id']" < $T/body)
NOME=$(psql_q -c "SELECT nome_originale FROM allegati_messaggio WHERE id=$A_NOME;")
if echo "$NOME" | grep -q '[/"]'; then ko "il nome salvato non ha separatori ne' virgolette" "senza / e \"" "$NOME"; else ok "il nome salvato non ha separatori ne' virgolette"; fi
eq "la chiave su disco e' casuale" "1" "$(psql_q -c "SELECT (chiave ~ '^[0-9a-f]{32}\$')::int FROM allegati_messaggio WHERE id=$A_NOME;")"
if [ -z "$(find /tmp/etc "$ALLEGATI_DIR/.." -maxdepth 1 -name 'pass*' 2>/dev/null)" ]; then ok "nessun file fuori dalla cartella"; else ko "nessun file fuori dalla cartella" "nessuno" "trovato"; fi
assert_http "nome con accenti -> 201" 201 up "$UT" "$QU" $T/doc.pdf 'Fattura è marzo.pdf'
A_ACC=$(j "['messaggio']['allegati'][0]['id']" < $T/body)
curl -s -D $T/h -o /dev/null "$API/messaggi/allegati/$A_ACC?$QU" -H "Authorization: Bearer $UT"
if grep -qi "filename\*=UTF-8''Fattura%20%C3%A8%20marzo.pdf" $T/h; then ok "il nome torna intatto nel download"; else ko "il nome torna intatto nel download" "filename*=UTF-8''Fattura%20%C3%A8..." "$(grep -i disposition $T/h)"; fi

echo
echo "=== E. download ==="
assert_http "il cliente scarica -> 200" 200 -D $T/h "$API/messaggi/allegati/$A_PDF?$QU" -H "Authorization: Bearer $UT"
eq "byte per byte" "$(sha $T/doc.pdf)" "$(sha $T/body)"
if grep -qi '^content-disposition: attachment' $T/h; then ok "sempre come download"; else ko "sempre come download" "attachment" "$(grep -i disposition $T/h)"; fi
if grep -qi '^x-content-type-options: nosniff' $T/h; then ok "nosniff"; else ko "nosniff" "presente" "assente"; fi
if grep -qi '^content-type: application/pdf' $T/h; then ok "content-type dal contenuto"; else ko "content-type dal contenuto" "application/pdf" "$(grep -i content-type $T/h)"; fi
eq "il download del cliente non va nel registro" "0" "$(righe_allegato)"
assert_http "lo studio scarica -> 200" 200 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"
eq "byte per byte anche per lo studio" "$(sha $T/doc.pdf)" "$(sha $T/body)"
assert_http "e scarica di nuovo" 200 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"
eq "una riga di registro per download" "2" "$(righe_allegato)"
eq "la riga dice quale allegato" "$A_PDF" "$(psql_q -c "SELECT DISTINCT dettagli->>'allegato_id' FROM accessi_commercialista WHERE collegamento_id=$COLL AND tipo_accesso='allegato';")"

echo
echo "=== F. isolamento fra collegamenti ==="
assert_http "allegato di un altro collegamento, dal cliente -> 404" 404 "$API/messaggi/allegati/$A_ALTRO?$QU" -H "Authorization: Bearer $UT"
assert_http "l'altro cliente non scarica il mio -> 404" 404 "$API/messaggi/allegati/$A_PDF" -H "Authorization: Bearer $UT2"
assert_http "l'altro cliente, nominando il mio collegamento -> 404" 404 "$API/messaggi/allegati/$A_PDF?$QU" -H "Authorization: Bearer $UT2"
assert_http "lo studio, passando per l'altro cliente -> 404" 404 "$API/messaggi/allegati/$A_PDF?userId=$CLI2" -H "Authorization: Bearer $CT"
assert_http "uno studio non collegato -> 404" 404 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT2"
assert_http "uno studio non collegato non carica -> 404" 404 up "$CT2" "$QC" $T/doc.pdf
assert_http "id non numerico -> 400 (U1)" 400 "$API/messaggi/allegati/abc?$QU" -H "Authorization: Bearer $UT"
eq "i tentativi non aggiungono righe" "2" "$(righe_allegato)"

echo
echo "=== G. fail-closed: registro non scrivibile, niente file ==="
psql_q -c "ALTER TABLE accessi_commercialista RENAME TO accessi_commercialista_guasta;" >/dev/null
assert_http "download dello studio -> 500" 500 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"
if grep -q "W5-PDF" $T/body; then ko "e nessun byte del file" "assente" "presente"; else ok "e nessun byte del file"; fi
psql_q -c "ALTER TABLE accessi_commercialista_guasta RENAME TO accessi_commercialista;" >/dev/null
assert_http "registro ripristinato -> 200" 200 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"

echo
echo "=== H. movimento citato ==="
assert_http "il cliente cita un movimento in ambito -> 201" 201 -X POST "$API/messaggi?$QU" -H "Authorization: Bearer $UT" "${JSON[@]}" \
  -d "{\"messaggio\":\"questo?\",\"movimento_id\":$M_OK}"
MSG_MOV=$(j "['messaggio']['id']" < $T/body)
ERR_CITA=""
assert_http "fuori ambito per conto, dal cliente -> 400" 400 -X POST "$API/messaggi?$QU" -H "Authorization: Bearer $UT" "${JSON[@]}" -d "{\"messaggio\":\"x\",\"movimento_id\":$M_CONTO}"
ERR_CITA=$(j "['error']" < $T/body)
assert_http "fuori ambito per data, dallo studio -> 400" 400 -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"messaggio\":\"x\",\"movimento_id\":$M_DATA}"
assert_http "il primo giorno dell'ambito si cita -> 201" 201 -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"messaggio\":\"x\",\"movimento_id\":$M_BORDO}"
assert_http "il giorno prima no -> 400" 400 -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"messaggio\":\"x\",\"movimento_id\":$M_VIGILIA}"
assert_http "movimento di un altro cliente -> 400" 400 -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"messaggio\":\"x\",\"movimento_id\":$M_ALTRO}"
eq "stessa risposta di un movimento inesistente" "$ERR_CITA" \
  "$(curl -s -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"messaggio":"x","movimento_id":99999999}' | j "['error']")"
assert_http "fuori ambito anche con un allegato -> 400" 400 up "$CT" "$QC" $T/doc.pdf doc.pdf -F "movimento_id=$M_CONTO"
assert_http "lo studio legge la chat" 200 "$API/messaggi?$QC&limit=200" -H "Authorization: Bearer $CT"
mov_di() { python3 -c "import sys,json;d=json.load(sys.stdin);m=[x for x in d['messaggi'] if x['id']==$MSG_MOV][0];print((m['movimento'] or {}).get('descrizione','-')+'|'+str(m['movimento_nascosto']))" < $T/body; }
eq "e vede il movimento citato" "W5-DENTRO-$SFX|False" "$(mov_di)"
psql_q -c "UPDATE movimenti SET conto_id=$CONTO_NO WHERE id=$M_OK;" >/dev/null
hit "$API/messaggi?$QC&limit=200" -H "Authorization: Bearer $CT" >/dev/null
eq "spostato fuori ambito: lo studio non ne vede il contenuto" "-|True" "$(mov_di)"
if grep -q "W5-DENTRO" $T/body; then ko "nemmeno altrove nella risposta" "assente" "presente"; else ok "nemmeno altrove nella risposta"; fi
hit "$API/messaggi?$QU&limit=200" -H "Authorization: Bearer $UT" >/dev/null
eq "il cliente lo vede ancora" "W5-DENTRO-$SFX|False" "$(mov_di)"
curl -s -X DELETE "$API/movimenti/$M_OK" -H "Authorization: Bearer $UT" >/dev/null
eq "movimento cancellato: il messaggio resta, senza riferimento" "1|" \
  "$(psql_q -c "SELECT count(*)||'|'||COALESCE(max(movimento_id)::text,'') FROM messaggi_commercialista WHERE id=$MSG_MOV;")"

echo
echo "=== I. richieste di chiarimento ==="
assert_http "lo studio apre una richiesta" 201 -X POST "$API/messaggi?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" \
  -d '{"messaggio":"mancano i documenti di marzo","chiarimento":true}'
CH=$(j "['messaggio']['id']" < $T/body)
eq "nasce aperta" "aperta" "$(j "['messaggio']['chiarimento_stato']" < $T/body)"
hit "$API/messaggi?$QU" -H "Authorization: Bearer $UT" >/dev/null
eq "il cliente la vede nel conteggio" "1" "$(j "['chiarimenti_aperti']" < $T/body)"
assert_http "elenco delle aperte" 200 "$API/messaggi/chiarimenti?$QU&stato=aperta" -H "Authorization: Bearer $UT"
eq "una sola" "$CH" "$(j "['chiarimenti'][0]['id']" < $T/body)"
assert_http "stato non valido -> 400" 400 -X PUT "$API/messaggi/$CH/chiarimento?$QU" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"stato":"chiusa"}'
assert_http "uno studio non collegato -> 404" 404 -X PUT "$API/messaggi/$CH/chiarimento?$QC" -H "Authorization: Bearer $CT2" "${JSON[@]}" -d '{"stato":"risolta"}'
assert_http "dall'altro collegamento -> 404" 404 -X PUT "$API/messaggi/$CH/chiarimento?userId=$CLI2" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"stato":"risolta"}'
assert_http "un messaggio normale non e' una richiesta -> 404" 404 -X PUT "$API/messaggi/$MSG_MOV/chiarimento?$QU" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"stato":"risolta"}'
# Dieci "risolvi" simultanei: uno solo passa.
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$API/messaggi/$CH/chiarimento?$QU" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"stato":"risolta"}' &
done > $T/conc; wait
eq "dieci risoluzioni concorrenti: una 200" "1" "$(grep -c '^200$' $T/conc)"
eq "e nove 409" "9" "$(grep -c '^409$' $T/conc)"
eq "risolta dal cliente, con data" "risolta|user|1" \
  "$(psql_q -c "SELECT chiarimento_stato||'|'||chiarimento_risolto_da||'|'||(chiarimento_risolto_at IS NOT NULL)::int FROM messaggi_commercialista WHERE id=$CH;")"
assert_http "lo studio la riapre" 200 -X PUT "$API/messaggi/$CH/chiarimento?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"stato":"aperta"}'
eq "riaperta, senza la data di risoluzione" "aperta|1" \
  "$(psql_q -c "SELECT chiarimento_stato||'|'||(chiarimento_risolto_at IS NULL AND chiarimento_risolto_da IS NULL)::int FROM messaggi_commercialista WHERE id=$CH;")"
assert_http "riaprire un'aperta -> 409" 409 -X PUT "$API/messaggi/$CH/chiarimento?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"stato":"aperta"}'
assert_http "richiesta con allegato" 201 up "$CT" "$QC" $T/doc.pdf richiesta.pdf -F "chiarimento=1" -F "messaggio=serve questo"
eq "anche lei aperta" "aperta" "$(j "['messaggio']['chiarimento_stato']" < $T/body)"

echo
echo "=== L. collegamento sospeso: niente chat, niente file ==="
curl -s -X PUT "$API/utenti/collegamenti/$COLL/sospendi" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}' >/dev/null
assert_http "lo studio non scarica -> 403" 403 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"
assert_http "lo studio non carica -> 403" 403 up "$CT" "$QC" $T/doc.pdf
assert_http "lo studio non tocca le richieste -> 403" 403 -X PUT "$API/messaggi/$CH/chiarimento?$QC" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"stato":"risolta"}'
curl -s -X PUT "$API/utenti/collegamenti/$COLL/riattiva" -H "Authorization: Bearer $UT" >/dev/null
assert_http "riattivato, scarica di nuovo" 200 "$API/messaggi/allegati/$A_PDF?$QC" -H "Authorization: Bearer $CT"

echo
echo "=== M. eliminazione dell'account: via anche i file ==="
CHIAVI=$(psql_q -c "SELECT string_agg(a.chiave, ' ') FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$COLL;")
N_CHIAVI=$(echo $CHIAVI | wc -w | tr -d ' ')
presenti() { local n=0; for k in $CHIAVI; do [ -f "$ALLEGATI_DIR/$k" ] && n=$((n+1)); done; echo $n; }
eq "prima: tutti i file del cliente su disco" "$N_CHIAVI" "$(presenti)"
assert_http "il cliente elimina l'account" 200 -X DELETE "$API/auth/account" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{"password":"Password123!"}'
eq "nessuna riga residua" "0" "$(allegati_coll $COLL)"
eq "i file spariscono dal disco" "0" "$(attendi 0 presenti)"
eq "e la coda di rimozione si svuota" "0" "$(attendi 0 psql_q -c "SELECT count(*) FROM allegati_da_rimuovere;")"
assert_http "l'allegato dell'altro cliente resta" 200 "$API/messaggi/allegati/$A_ALTRO" -H "Authorization: Bearer $UT2"

rm -rf "$T"
echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
