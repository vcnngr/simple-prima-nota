#!/usr/bin/env bash
# Smoke test del blocco U5 (fase UX): pagine dell'utente nel nuovo frontend.
#
#   A. API report a flusso: GET /reports/mesi (mese per mese, per conto e per
#      controparte) e GET /reports/mese (entrate per controparte, uscite per
#      categoria); somme uguali al database, isolamento, valori rifiutati;
#   B. API «da chiarire»: campo da_chiarire nei movimenti e filtro, solo su
#      collegamento attivo e richiesta aperta; movimento nelle richieste di
#      chiarimento per il cliente, non per lo studio; ambito come giorni;
#   C. build e browser (Chrome headless, nginx con la CSP vera): Movimenti con
#      ricerca, etichette e pannello dei filtri; scheda, modifica col tastierino,
#      eliminazione con conferma; scorrimento con «Elimina» annullabile e
#      «Studio»; Controparti e scheda con «+ Movimento»; Report mese per mese e
#      mese; Studio e chat (fascia da chiarire, invio, «Chiarito»); 390 px, zero
#      violazioni CSP; fotografie nei due temi;
#   D. database dopo il browser.
#
#   API=http://127.0.0.1:3320/api DB_CONTAINER=pn-u5-db TZ_BACKEND=America/Los_Angeles ./scripts/smoke/u5-pagine.sh
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
T="$(mktemp -d)"; NGX="u5web-$SFX"
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
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio Verdi $1\"}" | tok; }
browser() {
  "$@" > "$T/b.log" 2>&1
  grep -v '^CONTEGGIO' "$T/b.log"
  read -r BP BF <<< "$(awk '/^CONTEGGIO/{print $2, $3}' "$T/b.log")"
  [ -n "${BP:-}" ] || { BP=0; BF=1; echo "  FAIL  non concluso"; tail -5 "$T/b.log"; }
  PASS=$((PASS + BP)); FAIL=$((FAIL + BF))
}

# Il browser vive a Roma: i mesi «correnti» sono quelli del dispositivo.
CUR=$(TZ=Europe/Rome date +%Y-%m); OGGI=$(TZ=Europe/Rome date +%F)
mp() { python3 -c "import sys;a,m=map(int,'$CUR'.split('-'));m-=$1
while m<1: m+=12; a-=1
print(f'{a:04d}-{m:02d}')"; }
P1=$(mp 1); P2=$(mp 2); P3=$(mp 3)

echo "=== setup (suffisso $SFX, mese $CUR) ==="
U="u5a$SFX"; V="u5b$SFX"; C="u5c$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V"); CT=$(reg_c "$C")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); VID=$(q "SELECT id FROM utenti WHERE username='$V'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT"); AC=(-H "Authorization: Bearer $CT")
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Banca Intesa', 'U5', 1000, $UID_), ('Cassa', 'U5', 50, $UID_), ('Banca V', 'V', 10, $VID)" >/dev/null
C1=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Banca Intesa'"); C2=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_ AND nome_banca='Cassa'")
CV=$(q "SELECT id FROM conti_correnti WHERE user_id=$VID")
q "INSERT INTO anagrafiche (nome, user_id, attivo, tipo_movimento_preferito) VALUES
   ('Bianchi e Rossi srl', $UID_, true, 'Entrata'), ('Enel Energia', $UID_, true, 'Uscita'), ('Aruba spa', $UID_, true, 'Uscita'),
   ('Mai usata', $UID_, true, NULL), ('Enel di V', $VID, true, 'Uscita')" >/dev/null
aid() { q "SELECT id FROM anagrafiche WHERE nome='$1' AND user_id IN ($UID_, $VID)"; }
BIANCHI=$(aid 'Bianchi e Rossi srl'); ENEL=$(aid 'Enel Energia'); ARUBA=$(aid 'Aruba spa'); ENELV=$(aid 'Enel di V')
mv() { q "INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, user_id) VALUES ('$1', $2, $3, '$4', $5, $6, '$7', ${8:-$UID_}) RETURNING id"; }
M_BIANCHI=$(mv "$OGGI" $BIANCHI $C1 'Acconto progetto web' "'Vendite'" 3000 Entrata)
M_ENEL=$(mv "$CUR-01" $ENEL $C1 'Bolletta settembre' "'Utenze'" 184.37 Uscita)
M_ARUBA=$(mv "$CUR-01" $ARUBA $C1 'Rinnovo dominio' "'Software'" 29.89 Uscita)
M_BAR=$(mv "$OGGI" NULL $C2 'Bar Centrale' NULL 6.50 Uscita)
mv "$P1-15" $BIANCHI $C1 'Fattura 112' "'Vendite'" 1250 Entrata >/dev/null
mv "$P1-15" $ENEL $C1 'Bolletta agosto' "'Utenze'" 150.10 Uscita >/dev/null
mv "$P1-16" $ENEL $C2 'Conguaglio' "'Utenze'" 10 Uscita >/dev/null
mv "$P2-10" $ENEL $C1 'Bolletta luglio' "'Utenze'" 200 Uscita >/dev/null
q "INSERT INTO movimenti (data, conto_id, descrizione, categoria, importo, tipo, user_id)
   SELECT '$P3-05'::date, $C1, 'mov ' || g, 'Varie', 1, 'Uscita', $UID_ FROM generate_series(1, 35) g" >/dev/null
mv "$CUR-01" $ENELV $CV 'Bolletta di V' "'Utenze'" 999 Uscita $VID >/dev/null
eq "dati di prova: 43 movimenti di U, 1 di V" "43|1" "$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")|$(q "SELECT count(*) FROM movimenti WHERE user_id=$VID")"

echo
echo "=== A. report a flusso (API) ==="
hit "${AU[@]}" "$API/reports/mesi?fino=$CUR&mesi=4" > "$T/st"
eq "mesi: 200, 4 mesi dal piu' recente" "200|$CUR,$P1,$P2,$P3" "$(cat "$T/st")|$(py "print(','.join(m['mese'] for m in d['mesi']))")"
eq "mese corrente: 4 movimenti, entrate 3000.00, uscite 220.76" "4|3000.00|220.76" "$(py "m=d['mesi'][0];print(m['numero'],m['entrate'],m['uscite'],sep='|')")"
eq "mese -1 e -3: somme" "1250.00|160.10|0.00|35.00" "$(py "print(d['mesi'][1]['entrate'],d['mesi'][1]['uscite'],d['mesi'][3]['entrate'],d['mesi'][3]['uscite'],sep='|')")"
SQL_MESI=$(q "SELECT string_agg(to_char(data,'YYYY-MM')||':'||s, ',' ORDER BY data) FROM (SELECT date_trunc('month',data) AS data, sum(CASE WHEN tipo='Entrata' THEN importo ELSE -importo END) s FROM movimenti WHERE user_id=$UID_ GROUP BY 1) x")
eq "netto per mese uguale al database" "$SQL_MESI" "$(py "print(','.join(sorted(m['mese']+':'+format(float(m['entrate'])-float(m['uscite']),'.2f') for m in d['mesi'])))")"
hit "${AU[@]}" "$API/reports/mesi?fino=$CUR&mesi=4&conto_id=$C2" >/dev/null
eq "per conto (Cassa): corrente 6.50, -1 10.00" "6.50|10.00" "$(py "print(d['mesi'][0]['uscite'],d['mesi'][1]['uscite'],sep='|')")"
hit "${AU[@]}" "$API/reports/mesi?fino=$CUR&mesi=12&anagrafica_id=$ENEL" >/dev/null
eq "per controparte (Enel, 12 mesi): uscite 544.47, 4 movimenti" "544.47|4" "$(py "print(format(sum(float(m['uscite']) for m in d['mesi']),'.2f'),sum(m['numero'] for m in d['mesi']),sep='|')")"
hit "${AU[@]}" "$API/reports/mesi" >/dev/null
eq "senza fino: 12 mesi, il primo e' il mese del database" "12|$(q "SELECT to_char(CURRENT_DATE,'YYYY-MM')")" "$(py "print(len(d['mesi']),d['mesi'][0]['mese'],sep='|')")"
hit "${AV[@]}" "$API/reports/mesi?fino=$CUR&mesi=4&anagrafica_id=$ENEL" >/dev/null
eq "V con la controparte di U: zero" "0|0.00" "$(py "print(sum(m['numero'] for m in d['mesi']),format(sum(float(m['uscite']) for m in d['mesi']),'.2f'),sep='|')")"
hit "${AV[@]}" "$API/reports/mesi?fino=$CUR&mesi=4&conto_id=$C1" >/dev/null
eq "V con il conto di U: zero" "0" "$(py "print(sum(m['numero'] for m in d['mesi']))")"
hit "${AU[@]}" "$API/reports/mese?mese=$CUR" > "$T/st"
eq "mese: totali" "200|4|3000.00|220.76" "$(cat "$T/st")|$(py "t=d['totali'];print(t['numero'],t['entrate'],t['uscite'],sep='|')")"
eq "mese: entrate per controparte" "Bianchi e Rossi srl:3000.00:$BIANCHI" "$(py "print(','.join(f\"{v['nome']}:{v['totale']}:{v['anagrafica_id']}\" for v in d['entrate']))")"
eq "mese: uscite per categoria, dalla piu' grande" "Utenze:184.37,Software:29.89,Senza categoria:6.50" "$(py "print(','.join(f\"{v['nome']}:{v['totale']}\" for v in d['uscite']))")"
hit "${AU[@]}" "$API/reports/mese?mese=$CUR&conto_id=$C2" >/dev/null
eq "mese per conto (Cassa)" "0.00|6.50" "$(py "print(d['totali']['entrate'],d['totali']['uscite'],sep='|')")"
hit "${AV[@]}" "$API/reports/mese?mese=$CUR&conto_id=$C1" >/dev/null
eq "V con il conto di U: niente" "0|0|0" "$(py "print(d['totali']['numero'],len(d['entrate']),len(d['uscite']),sep='|')")"
for x in 'mesi?fino=2026-13' 'mesi?fino=0000-01' 'mesi?fino=2026-1' 'mesi?mesi=0' 'mesi?mesi=37' 'mesi?conto_id=abc' 'mesi?anagrafica_id=-1' 'mese' 'mese?mese=2026-00' "mese?mese=$CUR-01" 'mese?mese=0999-12'; do
  eq "report/$x -> 400" "400" "$(hit "${AU[@]}" "$API/reports/$x")"
done
eq "senza token -> 401" "401|401" "$(hit "$API/reports/mesi")|$(hit "$API/reports/mese?mese=$CUR")"
eq "token dello studio -> 401" "401" "$(hit "${AC[@]}" "$API/reports/mesi")"

echo
echo "=== B. da chiarire (API) ==="
curl -s -X POST "$API/commercialisti/richieste" "${AC[@]}" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$U\"}" >/dev/null
COLL=$(curl -s "$API/utenti/collegamenti" "${AU[@]}" | python3 -c "import sys,json;print(json.load(sys.stdin)['collegamenti'][0]['id'])")
curl -s -X PUT "$API/utenti/collegamenti/$COLL/accetta" "${AU[@]}" "${JSON[@]}" -d '{"ambito_dal":"2025-01-01"}' >/dev/null
hit "${AU[@]}" "$API/utenti/collegamenti" >/dev/null
eq "collegamento attivo, ambito come giorno (backend ${TZ_BACKEND:-?})" "attiva|2025-01-01|None" "$(py "c=d['collegamenti'][0];print(c['stato'],c['ambito_dal'],c['ambito_al'],sep='|')")"
eq "nessun movimento da chiarire" "0" "$(hit "${AU[@]}" "$API/movimenti?limit=100" >/dev/null; py "print(sum(1 for m in d['movimenti'] if m['da_chiarire']))")"
hit -X POST "${AC[@]}" "${JSON[@]}" "$API/messaggi?userId=$UID_" -d "{\"messaggio\":\"Mi manda lo scontrino?\",\"movimento_id\":$M_BAR,\"chiarimento\":true}" > "$T/st"
CH=$(py "print(d['messaggio']['id'])")
eq "lo studio chiede un chiarimento sul Bar" "201|aperta" "$(cat "$T/st")|$(py "print(d['messaggio']['chiarimento_stato'])")"
hit "${AU[@]}" "$API/movimenti?limit=100" >/dev/null
eq "lista: solo il Bar da chiarire" "$M_BAR" "$(py "print(','.join(str(m['id']) for m in d['movimenti'] if m['da_chiarire']))")"
eq "filtro da_chiarire=true" "200|$M_BAR|1" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=true")|$(py "print(','.join(str(m['id']) for m in d['movimenti']))")|$(py "print(d['pagination']['total'])")"
eq "filtro da_chiarire=false: gli altri 42" "42|0" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=false&limit=100" >/dev/null; py "print(d['pagination']['total'])")|$(py "print(sum(1 for m in d['movimenti'] if m['id']==$M_BAR))")"
eq "filtro da_chiarire=forse -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=forse")"
eq "dettaglio: da_chiarire" "True|False" "$(hit "${AU[@]}" "$API/movimenti/$M_BAR" >/dev/null; py "print(d['da_chiarire'])")|$(hit "${AU[@]}" "$API/movimenti/$M_ENEL" >/dev/null; py "print(d['da_chiarire'])")"
eq "V: dettaglio del Bar 404, nessuno da chiarire" "404|0" "$(hit "${AV[@]}" "$API/movimenti/$M_BAR")|$(hit "${AV[@]}" "$API/movimenti?da_chiarire=true" >/dev/null; py "print(d['pagination']['total'])")"
hit "${AU[@]}" "$API/messaggi/chiarimenti?stato=aperta" >/dev/null
eq "chiarimenti del cliente: movimento con giorno e importo" "$M_BAR|$OGGI|6.50|Uscita|None" "$(py "m=d['chiarimenti'][0]['movimento'];print(m['id'],m['giorno'],m['importo'],m['tipo'],m['controparte'],sep='|')")"
hit "${AC[@]}" "$API/messaggi/chiarimenti?userId=$UID_&stato=aperta" >/dev/null
eq "chiarimenti dello studio: solo l'id, niente movimento" "$M_BAR|None" "$(py "c=d['chiarimenti'][0];print(c['movimento_id'],c['movimento'],sep='|')")"
curl -s -X PUT "$API/utenti/collegamenti/$COLL/sospendi" "${AU[@]}" "${JSON[@]}" -d '{}' >/dev/null
eq "collegamento sospeso: niente da chiarire" "0|False" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=true" >/dev/null; py "print(d['pagination']['total'])")|$(hit "${AU[@]}" "$API/movimenti/$M_BAR" >/dev/null; py "print(d['da_chiarire'])")"
curl -s -X PUT "$API/utenti/collegamenti/$COLL/riattiva" "${AU[@]}" >/dev/null
eq "riattivato: di nuovo da chiarire" "1" "$(hit "${AU[@]}" "$API/movimenti?da_chiarire=true" >/dev/null; py "print(d['pagination']['total'])")"
# Seconda richiesta, poi risolta: la riga torna normale solo senza richieste aperte.
hit -X POST "${AC[@]}" "${JSON[@]}" "$API/messaggi?userId=$UID_" -d "{\"messaggio\":\"E la fattura Enel?\",\"movimento_id\":$M_ENEL,\"chiarimento\":true}" > "$T/st"
CH2=$(py "print(d['messaggio']['id'])")
curl -s -X PUT "$API/messaggi/$CH2/chiarimento?userId=$UID_" "${AC[@]}" "${JSON[@]}" -d '{"stato":"risolta"}' >/dev/null
eq "richiesta risolta: Enel non piu' da chiarire" "False" "$(hit "${AU[@]}" "$API/movimenti/$M_ENEL" >/dev/null; py "print(d['da_chiarire'])")"

echo
echo "=== C. build e browser ==="
[ -d "$D/node_modules" ] || (cd "$D" && npm ci --no-fund --no-audit >/dev/null 2>&1)
(cd "$D" && npm run build) > "$T/build.log" 2>&1
eq "npm run build: exit 0" "0" "$?"
eq "nessun segnaposto fra le pagine dell'utente" "0" "$(grep -cE "Segnaposto titolo=\"(Movimenti|Report|Il tuo studio)\"" "$D/src/App.jsx")"
eq "fetch solo in src/api/client.js" "src/api/client.js" "$(cd "$D" && grep -rl 'fetch(' src | sort | paste -sd, -)"
PORTA_API=$(python3 -c "from urllib.parse import urlparse;print(urlparse('$API').port or 80)")
docker run -d --name "$NGX" -p 127.0.0.1::80 -e BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-host.docker.internal:$PORTA_API}" \
  -e CLIENT_MAX_BODY_SIZE=11m -e NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
  -v "$D/dist:/usr/share/nginx/html:ro" -v "$R/frontend/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  docker.io/library/nginx:1.30-alpine >/dev/null 2>&1
WEB="http://127.0.0.1:$(docker port "$NGX" 80 2>/dev/null | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do [ "$(curl -s --max-time 1 -o /dev/null -w '%{http_code}' "$WEB/api/health")" = 200 ] && break; sleep 0.5; done
eq "nginx con la CSP del progetto" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")"
NETTO_ENEL=$(q "SELECT (-sum(importo)*100)::bigint FROM movimenti WHERE anagrafica_id=$ENEL AND data >= date_trunc('month', '$CUR-01'::date) - interval '11 months'")
WEB="$WEB" CHROME="$CHROME" PROFILO="$T/chrome" FOTO="$FOTO" UTENTE="$U" PW="$PW" CUR="$CUR" OGGI="$OGGI" \
  M_BAR="$M_BAR" M_ENEL="$M_ENEL" M_ARUBA="$M_ARUBA" M_BIANCHI="$M_BIANCHI" ENEL="$ENEL" C2="$C2" NETTO_ENEL="$NETTO_ENEL" \
  browser node "$R/scripts/smoke/lib/u5-browser.mjs"
echo "  fotografie: $FOTO"

echo
echo "=== D. database dopo il browser ==="
eq "Aruba modificato: 31,50, data e descrizione invariate" "31.50|$CUR-01|Rinnovo dominio|Uscita" "$(q "SELECT importo||'|'||to_char(data,'YYYY-MM-DD')||'|'||descrizione||'|'||tipo FROM movimenti WHERE id=$M_ARUBA")"
eq "Bianchi: eliminazione annullata, poi eliminato dopo 5 s" "0" "$(q "SELECT count(*) FROM movimenti WHERE id=$M_BIANCHI")"
eq "Enel (corrente) eliminato dalla scheda con conferma" "0" "$(q "SELECT count(*) FROM movimenti WHERE id=$M_ENEL")"
eq "messaggio allo studio con il movimento citato (dallo scorrimento)" "1" "$(q "SELECT count(*) FROM messaggi_commercialista WHERE collegamento_id=$COLL AND mittente_tipo='user' AND movimento_id=$M_BAR AND messaggio='Ecco lo scontrino'")"
eq "messaggio dalla chat" "1" "$(q "SELECT count(*) FROM messaggi_commercialista WHERE collegamento_id=$COLL AND mittente_tipo='user' AND messaggio='Grazie, a presto' AND movimento_id IS NULL")"
eq "richiesta sul Bar chiarita dal cliente" "risolta|user" "$(q "SELECT chiarimento_stato||'|'||chiarimento_risolto_da FROM messaggi_commercialista WHERE id=$CH")"
eq "+ Movimento dalla scheda di Enel: 5,00 Uscita su Enel, oggi" "5.00|Uscita|$OGGI" "$(q "SELECT importo||'|'||tipo||'|'||to_char(data,'YYYY-MM-DD') FROM movimenti WHERE anagrafica_id=$ENEL AND importo=5")"
eq "messaggi dello studio letti aprendo la chat" "0" "$(q "SELECT count(*) FROM messaggi_commercialista WHERE collegamento_id=$COLL AND mittente_tipo='commercialista' AND NOT letto")"
eq "V intatto" "1|999.00" "$(q "SELECT count(*)||'|'||max(importo) FROM movimenti WHERE user_id=$VID")"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
