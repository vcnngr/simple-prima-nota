#!/usr/bin/env bash
# Smoke test del blocco U6a (fase UX): le parti dell'utente che mancavano al
# nuovo frontend prima di togliere il vecchio.
#
#   A. API ambito: PUT /utenti/collegamenti/:id/ambito (solo su attivo o sospeso,
#      conti propri, date valide, isolamento) e il suo effetto su cio' che lo
#      studio vede;
#   B. API documenti: GET /messaggi/documenti per cliente e studio, movimento
#      citato solo dentro l'ambito per lo studio, isolamento, accesso registrato;
#   C. API controparti e conti: tipo «di solito» salvato in creazione, tipologia
#      altrui rifiutata, nome e P.IVA doppi rifiutati in modifica (prima 500 o
#      accettati), IBAN doppio rifiutato in modifica, saldo iniziale negativo;
#   D. browser (Chrome headless, nginx con la CSP vera): richiesta accettata in
#      3 passi, permessi (conti, sospendi, riattiva), 📎 e Documenti con download,
#      «+ Crea» nel selettore, modifica della controparte, conti come carte,
#      nuovo conto, modifica del saldo iniziale con avviso, eliminazioni; 390 px,
#      zero violazioni CSP; fotografie nei due temi;
#   E. database dopo il browser.
#
#   API=http://127.0.0.1:3330/api DB_CONTAINER=pn-u6-db ./scripts/smoke/u6a-registro.sh
#
# File temporanei in TMPDIR (predefinito di mktemp). Esce 1 se un caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; NGX="u6aweb-$SFX"
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
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}
# richiesta <token studio> <username cliente> <token cliente>: id del collegamento in attesa
richiesta() {
  curl -s -X POST "$API/commercialisti/richieste" -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$2\"}" >/dev/null
  curl -s "$API/utenti/collegamenti" -H "Authorization: Bearer $3" | python3 -c "import sys,json;print([c['id'] for c in json.load(sys.stdin)['collegamenti'] if c['stato']=='in_attesa'][0])" 2>/dev/null; }
# File ammessi: il tipo si riconosce dal contenuto.
printf '%%PDF-1.4\n%% prova U6a\n%%%%EOF\n' > "$T/scontrino.pdf"
printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDRprova-u6a' > "$T/ricevuta.png"
printf '<html>no</html>' > "$T/pagina.html"
OGGI=$(TZ=Europe/Rome date +%F)

echo "=== setup (suffisso $SFX) ==="
U="u6a$SFX"; V="u6b$SFX"; W="u6w$SFX"; C="u6c$SFX"; C2="u6d$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); WT=$(reg_u "$W"); CT=$(reg_c "$C" "Studio Verdi"); C2T=$(reg_c "$C2" "Studio Neri")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); VID=$(q "SELECT id FROM utenti WHERE username='$V'"); WID=$(q "SELECT id FROM utenti WHERE username='$W'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AW=(-H "Authorization: Bearer $WT")
AC=(-H "Authorization: Bearer $CT"); AC2=(-H "Authorization: Bearer $C2T")
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id, iban) VALUES
   ('Banca Intesa', 'U6', 1000, $UID_, 'IT60X0542811101000000123456'), ('Cassa', 'U6', 50, $UID_, NULL),
   ('Banca V', 'V', 10, $VID, NULL), ('Conto W', 'W', 0, $WID, NULL), ('Carta W', 'W', 0, $WID, NULL)" >/dev/null
cid() { q "SELECT id FROM conti_correnti WHERE nome_banca='$1' AND user_id IN ($UID_, $VID, $WID)"; }
C1=$(cid 'Banca Intesa'); CC=$(cid 'Cassa'); CV=$(cid 'Banca V'); CW=$(cid 'Conto W'); CW2=$(cid 'Carta W')
q "INSERT INTO anagrafiche (nome, user_id, attivo, tipo_movimento_preferito, piva) VALUES
   ('Enel Energia', $UID_, true, 'Uscita', '00934061003'), ('Aruba spa', $UID_, true, 'Uscita', NULL)" >/dev/null
ENEL=$(q "SELECT id FROM anagrafiche WHERE nome='Enel Energia' AND user_id=$UID_"); ARUBA=$(q "SELECT id FROM anagrafiche WHERE nome='Aruba spa' AND user_id=$UID_")
TIPV=$(q "INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default) VALUES ($VID, 'Tipologia di V', 'Entrata') RETURNING id")
mv() { q "INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, importo, tipo, user_id) VALUES ('$1', $2, $3, '$4', $5, '$6', $7) RETURNING id"; }
M_ENEL=$(mv 2026-09-10 $ENEL $C1 'Bolletta settembre' 184.37 Uscita $UID_)
mv 2026-09-12 NULL $CC 'Bar Centrale' 6.50 Uscita $UID_ >/dev/null
MW1=$(mv 2026-02-01 NULL $CW 'W conto' 10 Uscita $WID); MW2=$(mv 2026-03-01 NULL $CW2 'W carta' 20 Uscita $WID)
mv 2025-12-31 NULL $CW 'W vecchio' 5 Uscita $WID >/dev/null

echo
echo "=== A. ambito del collegamento ==="
CW_ID=$(richiesta "$C2T" "$W" "$WT")
amb() { hit -X PUT "${@:2}" "${JSON[@]}" "$API/utenti/collegamenti/$CW_ID/ambito" -d "$1"; }
dbamb() { q "SELECT stato||'|'||coalesce(to_char(ambito_dal,'YYYY-MM-DD'),'-')||'|'||coalesce(to_char(ambito_al,'YYYY-MM-DD'),'-')||'|'||coalesce(array_to_string(conti_ammessi,','),'-') FROM collegamenti_commercialista WHERE id=$CW_ID"; }
eq "in attesa: ambito non si cambia (409), nulla scritto" "409|in_attesa|-|-|-" "$(amb '{"conti_ammessi":['$CW']}' "${AW[@]}")|$(dbamb)"
curl -s -X PUT "$API/utenti/collegamenti/$CW_ID/accetta" "${AW[@]}" "${JSON[@]}" -d '{}' >/dev/null
studio_mov() { hit "${AC2[@]}" "$API/commercialisti/clienti/$WID?limit=50" >/dev/null; py "print(d['pagination']['total'])"; }
eq "accettato senza limiti: lo studio vede 3 movimenti" "3" "$(studio_mov)"
eq "solo Conto W dal 2026-01-01: 200, scritto" "200|attiva|2026-01-01|-|$CW" "$(amb "{\"ambito_dal\":\"2026-01-01\",\"conti_ammessi\":[$CW]}" "${AW[@]}")|$(dbamb)"
eq "lo studio ora vede 1 movimento" "1" "$(studio_mov)"
eq "conti doppi: salvati una volta" "200|attiva|-|-|$CW" "$(amb "{\"conti_ammessi\":[$CW,$CW]}" "${AW[@]}")|$(dbamb)"
for b in "{\"conti_ammessi\":[$CV]}" "{\"conti_ammessi\":[$CW,$CV]}" '{"ambito_dal":"2026-05-01","ambito_al":"2026-04-01"}' '{"ambito_dal":"2026-02-30"}' '{"ambito_dal":"0000-01-01"}' '{"conti_ammessi":["x"]}' '{"conti_ammessi":[0]}'; do
  eq "rifiutato $b: 400, ambito invariato" "400|attiva|-|-|$CW" "$(amb "$b" "${AW[@]}")|$(dbamb)"
done
eq "V sul collegamento di W: 404, invariato" "404|attiva|-|-|$CW" "$(amb '{}' "${AV[@]}")|$(dbamb)"
eq "token dello studio: 401" "401" "$(amb '{}' "${AC2[@]}")"
eq "id non intero: 400" "400" "$(hit -X PUT "${AW[@]}" "${JSON[@]}" "$API/utenti/collegamenti/1x/ambito" -d '{}')"
eq "risposta senza giorni Date (niente slittamento)" "None" "$(amb "{\"conti_ammessi\":[$CW]}" "${AW[@]}" >/dev/null; py "print(d['collegamento'].get('ambito_dal'))")"
curl -s -X PUT "$API/utenti/collegamenti/$CW_ID/sospendi" "${AW[@]}" "${JSON[@]}" -d '{}' >/dev/null
eq "sospeso: si cambia, resta sospeso" "200|sospesa|-|-|-" "$(amb '{"conti_ammessi":null}' "${AW[@]}")|$(dbamb)"
eq "sospeso: lo studio non vede niente (403)" "403" "$(hit "${AC2[@]}" "$API/commercialisti/clienti/$WID")"
curl -s -X PUT "$API/utenti/collegamenti/$CW_ID/riattiva" "${AW[@]}" >/dev/null
eq "riattivato con l'ambito cambiato da sospeso: vede 3" "3" "$(studio_mov)"

echo
echo "=== B. documenti della chat ==="
up() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" -X POST "$API/messaggi/allegati$1" "${@:3}" -F "file=@$2"; }
eq "W manda il pdf citando il movimento del conto: 201" "201" "$(up '' "$T/scontrino.pdf" "${AW[@]}" -F "movimento_id=$MW1" -F 'messaggio=ecco')"
eq "lo studio manda il png: 201" "201" "$(up "?userId=$WID" "$T/ricevuta.png" "${AC2[@]}")"
eq "html rifiutato: 415" "415" "$(up '' "$T/pagina.html" "${AW[@]}")"
doc() { hit "${@:2}" "$API/messaggi/documenti$1" >/dev/null; py "print(','.join(f\"{x['nome']}:{x['mittente_tipo']}:{(x['movimento'] or {}).get('id','-')}\" for x in d['documenti']))"; }
eq "W: due documenti, il piu' recente prima, movimento citato" "ricevuta.png:commercialista:-,scontrino.pdf:user:$MW1" "$(doc '' "${AW[@]}")"
N0=$(q "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$CW_ID AND tipo_accesso='chat'")
eq "studio: gli stessi due, movimento visibile (ambito pieno)" "ricevuta.png:commercialista:-,scontrino.pdf:user:$MW1" "$(doc "?userId=$WID" "${AC2[@]}")"
eq "accesso dello studio registrato (chat, una volta all'ora)" "$((N0 + 1))" "$(q "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$CW_ID AND tipo_accesso='chat'")"
amb "{\"conti_ammessi\":[$CW2]}" "${AW[@]}" >/dev/null
eq "conto escluso: lo studio vede il file ma non il movimento" "ricevuta.png:commercialista:-,scontrino.pdf:user:-" "$(doc "?userId=$WID" "${AC2[@]}")"
eq "il cliente continua a vedere il movimento" "ricevuta.png:commercialista:-,scontrino.pdf:user:$MW1" "$(doc '' "${AW[@]}")"
eq "V senza studio: 404" "404" "$(hit "${AV[@]}" "$API/messaggi/documenti")"
eq "un altro studio su W: 404" "404" "$(hit "${AC[@]}" "$API/messaggi/documenti?userId=$WID")"
eq "studio senza userId: 400" "400" "$(hit "${AC2[@]}" "$API/messaggi/documenti")"
eq "userId non valido: 400, nessun messaggio pg" "400|0" "$(hit "${AC2[@]}" "$API/messaggi/documenti?userId=abc")|$(grep -ci 'syntax\|pg\|relation' "$T/body")"
A_PDF=$(q "SELECT a.id FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$CW_ID AND a.nome_originale='scontrino.pdf'")
curl -s -o "$T/scaricato" "$API/messaggi/allegati/$A_PDF" "${AW[@]}"
eq "download del cliente: byte identici" "$(shasum -a 256 < "$T/scontrino.pdf" | cut -c1-64)" "$(shasum -a 256 < "$T/scaricato" | cut -c1-64)"
curl -s -X PUT "$API/utenti/collegamenti/$CW_ID/sospendi" "${AW[@]}" "${JSON[@]}" -d '{}' >/dev/null
eq "sospeso: documenti chiusi (cliente 404: nessun collegamento attivo; studio 403)" "404|403" "$(hit "${AW[@]}" "$API/messaggi/documenti")|$(hit "${AC2[@]}" "$API/messaggi/documenti?userId=$WID")"
curl -s -X DELETE "$API/utenti/collegamenti/$CW_ID" "${AW[@]}" "${JSON[@]}" -d '{}' >/dev/null
eq "revocato: l'ambito non si cambia piu' (409)" "409|revocata" "$(amb '{}' "${AW[@]}")|$(q "SELECT stato FROM collegamenti_commercialista WHERE id=$CW_ID")"

echo
echo "=== C. controparti e conti ==="
hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche" -d '{"nome":"Idraulico Rossi","tipo_movimento_preferito":"Uscita"}' >/dev/null
eq "creazione: «di solito Uscita» salvato (prima perso)" "Uscita" "$(q "SELECT coalesce(tipo_movimento_preferito,'NULL') FROM anagrafiche WHERE user_id=$UID_ AND nome='Idraulico Rossi'")"
eq "creazione con la tipologia di V: 400, niente creato" "400|0" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche" -d "{\"nome\":\"Con tipologia altrui\",\"tipologia_id\":$TIPV}")|$(q "SELECT count(*) FROM anagrafiche WHERE nome='Con tipologia altrui' AND user_id=$UID_")"
eq "creazione con nome doppio (maiuscole): 400" "400" "$(hit -X POST "${AU[@]}" "${JSON[@]}" "$API/anagrafiche" -d '{"nome":"ENEL ENERGIA"}')"
eq "modifica con la tipologia di V: 400, invariata" "400|-" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$ARUBA" -d "{\"tipologia_id\":$TIPV}")|$(q "SELECT coalesce(tipologia_id::text,'-') FROM anagrafiche WHERE id=$ARUBA")"
eq "modifica col nome di un'altra: 400 (prima 500), invariata" "400|Aruba spa" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$ARUBA" -d '{"nome":"Enel Energia"}')|$(q "SELECT nome FROM anagrafiche WHERE id=$ARUBA")"
eq "modifica con la P.IVA di Enel: 400 (prima accettata)" "400|-" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$ARUBA" -d '{"piva":"00934061003"}')|$(q "SELECT coalesce(piva,'-') FROM anagrafiche WHERE id=$ARUBA")"
eq "Enel tiene la sua P.IVA: 200" "200" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/anagrafiche/$ENEL" -d '{"piva":"00934061003"}')"
eq "V modifica Aruba di U: 404" "404" "$(hit -X PUT "${AV[@]}" "${JSON[@]}" "$API/anagrafiche/$ARUBA" -d '{"nome":"preso"}')"
eq "conto: IBAN di Banca Intesa sulla Cassa: 400 (prima accettato)" "400|-" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/conti-bancari/$CC" -d '{"iban":"IT60X0542811101000000123456"}')|$(q "SELECT coalesce(iban,'-') FROM conti_correnti WHERE id=$CC")"
eq "conto: il suo IBAN resta suo: 200" "200" "$(hit -X PUT "${AU[@]}" "${JSON[@]}" "$API/conti-bancari/$C1" -d '{"iban":"IT60X0542811101000000123456"}')"
eq "V modifica il conto di U: 404" "404" "$(hit -X PUT "${AV[@]}" "${JSON[@]}" "$API/conti-bancari/$C1" -d '{"nome_banca":"preso"}')"

echo
echo "=== D. build e browser ==="
CU_ID=$(richiesta "$CT" "$U" "$UT")
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/frontend/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" UTENTE="$U" PW="$PW" OGGI="$OGGI" PDF="$T/scontrino.pdf" \
  PDF_BYTE="$(wc -c < "$T/scontrino.pdf" | tr -d ' ')" COLL="$CU_ID" C1="$C1" CC="$CC" ENEL="$ENEL" \
  browser node "$R/scripts/smoke/lib/u6a-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== E. database dopo il browser ==="
eq "richiesta accettata: attiva, dal 2026-01-01, solo Banca Intesa, poi + Cassa" "attiva|2026-01-01|-|$(printf '%s\n' $C1 $CC | sort -n | paste -sd, -)" \
  "$(q "SELECT stato||'|'||coalesce(to_char(ambito_dal,'YYYY-MM-DD'),'-')||'|'||coalesce(to_char(ambito_al,'YYYY-MM-DD'),'-')||'|'||array_to_string(ARRAY(SELECT unnest(conti_ammessi) ORDER BY 1),',') FROM collegamenti_commercialista WHERE id=$CU_ID")"
eq "il pdf dalla 📎: un allegato del cliente, byte giusti" "1|$(wc -c < "$T/scontrino.pdf" | tr -d ' ')" "$(q "SELECT count(*)||'|'||max(a.dimensione) FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$CU_ID AND m.mittente_tipo='user' AND a.nome_originale='scontrino.pdf'")"
eq "«+ Crea»: Bar Roma creata e sul movimento di 3,20" "1|3.20|Uscita" "$(q "SELECT count(DISTINCT a.id)||'|'||max(m.importo)||'|'||max(m.tipo) FROM anagrafiche a JOIN movimenti m ON m.anagrafica_id=a.id WHERE a.user_id=$UID_ AND a.nome='Bar Roma'")"
eq "Enel modificata: categoria, P.IVA, disattivata; nome invariato" "Enel Energia|Luce e gas|00934061003|false" "$(q "SELECT nome||'|'||categoria||'|'||piva||'|'||attivo FROM anagrafiche WHERE id=$ENEL")"
eq "Enel non eliminata (ha movimenti)" "1" "$(q "SELECT count(*) FROM anagrafiche WHERE id=$ENEL")"
eq "saldo iniziale di Banca Intesa: 1.250,00" "1250.00" "$(q "SELECT saldo_iniziale FROM conti_correnti WHERE id=$C1")"
eq "conto nuovo creato con saldo negativo, poi eliminato" "0|1" "$(q "SELECT count(*) FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Carta prepagata'")|$(grep -c 'nuovo conto: -12.30' "$T/b.log")"
eq "Banca Intesa non eliminata (ha movimenti)" "1" "$(q "SELECT count(*) FROM conti_correnti WHERE id=$C1")"
eq "V intatto" "1|Banca V" "$(q "SELECT count(*)||'|'||max(nome_banca) FROM conti_correnti WHERE user_id=$VID")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
