#!/usr/bin/env bash
# Smoke test del blocco S3 (migration 010): eliminazione dell'account di uno
# studio e pulizia dei file degli allegati che nessun allegato nomina.
#
# Verifica:
#   A-C. DELETE /api/commercialisti/account: password, token del tipo giusto;
#   D-E. dopo l'eliminazione: collegamenti aperti revocati con avviso al cliente
#        (mail consegnata), niente posta allo studio, sessioni e link chiusi,
#        login e reset impossibili, username ed email di nuovo liberi, dati di
#        contatto tolti; restano al cliente ragione sociale, messaggi, allegati
#        (file compreso) e registro degli accessi;
#   F-G. cinque eliminazioni simultanee: una sola riesce; password vecchia, anche
#        cambiata mentre la richiesta aspetta il lock: rifiutata;
#   H.   DELETE fisico di uno studio con collegamenti: rifiutato dal database;
#   I.   file orfani: rimossi solo i nomi generati dal backend, vecchi, senza
#        allegato; i file vivi, recenti o estranei restano;
#   L.   gara consegna/eliminazione (s3-gara-notifiche.js): nessuna mail allo
#        studio dopo il commit dell'eliminazione;
#   K.   rollback 010..007 e riapplicazione con migra.sh: senza tabelle la pulizia
#        non cancella nulla; dopo, i file degli allegati tolti dal down della 007
#        spariscono; lo studio eliminato torna eliminato.
#
# Il backend deve girare con ALLEGATI_DIR (letto anche da qui), pulizia rapida e
# SMTP verso mailpit:
#   ALLEGATI_DIR=/tmp/pn-s3-allegati ALLEGATI_PULIZIA_MS=500 ALLEGATI_ORFANI_MS=500 \
#   NOTIFICHE_INTERVALLO_MS=500 SMTP_HOST=127.0.0.1 SMTP_PORT=<smtp> ... node server.js
#
#   API=http://localhost:3110/api DB_CONTAINER=pn-s3-db MAIL_API=http://localhost:55512 \
#   ALLEGATI_DIR=/tmp/pn-s3-allegati BACKEND_LOG=/tmp/pn-s3-backend.log ./scripts/smoke/s3-eliminazione-studio.sh
#
# La sezione K toglie e rimette le migration 007..010 sul database indicato
# (password del database: DB_PASSWORD, default pw).
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"
DB_PASSWORD="${DB_PASSWORD:-pw}"
MAIL_API="${MAIL_API:-http://localhost:8025}"
ALLEGATI_DIR="${ALLEGATI_DIR:-}"
BACKEND_LOG="${BACKEND_LOG:-}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T=$(mktemp -d)
trap 'rm -rf "${T:?}"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
qerr() { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -c "$1" 2>&1; }
j()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
hit() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" "$@"; }
JSON=(-H "Content-Type: application/json")
assert_http() {
  local desc="$1" atteso="$2"; shift 2
  local got; got=$(hit "$@")
  if [ "$got" = "$atteso" ]; then ok "$desc"; else ko "$desc" "HTTP $atteso" "HTTP $got — $(head -c 200 "$T/body")"; fi
}
attendi() {  # attendi <atteso> <comando...>: fino a 15 s
  local atteso="$1"; shift; local v
  for _ in $(seq 1 30); do v=$("$@"); [ "$v" = "$atteso" ] && { echo "$v"; return; }; sleep 0.5; done
  echo "$v"
}
mail_a() {  # mail_a <indirizzo>
  curl -s --max-time 5 "$MAIL_API/api/v1/messages?limit=500" | python3 -c "
import sys,json
d=json.load(sys.stdin); to='$1'.lower()
print(sum(1 for m in d.get('messages',[]) if any(a['Address'].lower()==to for a in m.get('To',[]))))" 2>/dev/null || echo "-"
}
migra() {
  docker run --rm --network "container:$DB_CONTAINER" -e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD="$DB_PASSWORD" \
    -e PGDATABASE="$DB_NAME" -v "$R/database:/database:ro" docker.io/library/postgres:16.15-bookworm bash /database/migra.sh "$@" > "$T/migra" 2>&1
}

reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" | j "['token']"; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"$2\",\"telefono\":\"06 123\",\"partita_iva\":\"12345678901\"}" | j "['token']"; }
uid()  { q "SELECT id FROM utenti WHERE username='$1'"; }
cid()  { q "SELECT id FROM commercialisti WHERE username='$1'"; }
richiedi() { curl -s -X POST "$API/commercialisti/richieste" -H "Authorization: Bearer $1" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$2\"}" >/dev/null; }
coll_di() { q "SELECT id FROM collegamenti_commercialista WHERE commercialista_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 1"; }
accetta() { curl -s -X PUT "$API/utenti/collegamenti/$2/accetta" -H "Authorization: Bearer $1" "${JSON[@]}" -d '{}' >/dev/null; }
su_disco() { [ -f "$ALLEGATI_DIR/$1" ] && echo 1 || echo 0; }

echo "=== setup (suffisso $SFX) ==="
eq "migration 010 applicata" "1" "$(q "SELECT count(*) FROM schema_migrazioni WHERE versione='010'")"
eq "ALLEGATI_DIR leggibile" "1" "$([ -n "$ALLEGATI_DIR" ] && [ -d "$ALLEGATI_DIR" ] && echo 1 || echo 0)"
[ -n "$ALLEGATI_DIR" ] || { echo "ALLEGATI_DIR obbligatorio"; exit 1; }
C="s3c$SFX"; U1="s3u$SFX"; U2="s3v$SFX"; U3="s3w$SFX"
CT=$(reg_c "$C" "Studio S3 $SFX"); UT1=$(reg_u "$U1"); UT2=$(reg_u "$U2"); UT3=$(reg_u "$U3")
CID=$(cid "$C"); ID1=$(uid "$U1"); ID2=$(uid "$U2"); ID3=$(uid "$U3")
# U1: attivo, con allegato e accessi. U2: richiesta in attesa. U3: gia' revocato dal cliente.
richiedi "$CT" "$U1"; COLL1=$(coll_di "$CID" "$ID1"); accetta "$UT1" "$COLL1"
richiedi "$CT" "$U2"; COLL2=$(coll_di "$CID" "$ID2")
richiedi "$CT" "$U3"; COLL3=$(coll_di "$CID" "$ID3"); accetta "$UT3" "$COLL3"
curl -s -X DELETE "$API/utenti/collegamenti/$COLL3" -H "Authorization: Bearer $UT3" "${JSON[@]}" -d '{}' >/dev/null
eq "stati di partenza" "attiva|in_attesa|revocata" "$(q "SELECT string_agg(stato,'|' ORDER BY id) FROM collegamenti_commercialista WHERE id IN ($COLL1,$COLL2,$COLL3)")"
curl -s "$API/commercialisti/clienti/$ID1" -H "Authorization: Bearer $CT" >/dev/null
printf '%%PDF-1.4\n%% S3-%s\n1 0 obj <<>> endobj\ntrailer <<>>\n%%%%EOF\n' "$SFX" > "$T/doc.pdf"
assert_http "allegato del cliente caricato" 201 -X POST "$API/messaggi/allegati?collegamentoId=$COLL1" \
  -H "Authorization: Bearer $UT1" -F "file=@$T/doc.pdf;filename=fattura.pdf" -F "messaggio=fattura di marzo"
CHIAVE=$(q "SELECT a.chiave FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$COLL1")
eq "file dell'allegato su disco" "1" "$(su_disco "$CHIAVE")"
MSG_PRIMA=$(q "SELECT count(*) FROM messaggi_commercialista WHERE collegamento_id=$COLL1")
ACC_PRIMA=$(q "SELECT count(*) FROM accessi_commercialista WHERE collegamento_id=$COLL1")
eq "registro con accessi" "1" "$([ "${ACC_PRIMA:-0}" -gt 0 ] 2>/dev/null && echo 1 || echo 0)"
# Un link di reset aperto e una notifica per lo studio in coda (la si vede annullare).
curl -s -X POST "$API/commercialisti/password-dimenticata" "${JSON[@]}" -H "X-Forwarded-For: 10.3.0.1" -d "{\"identificativo\":\"$C\"}" >/dev/null
eq "link di reset aperto" "1" "$(attendi 1 q "SELECT count(*) FROM token_account WHERE commercialista_id=$CID AND usato_il IS NULL AND annullato_il IS NULL")"
q "INSERT INTO notifiche (collegamento_id, destinatario_tipo, evento, prossimo_tentativo) VALUES ($COLL1,'commercialista','richiesta_accettata', NOW() + INTERVAL '1 day')" >/dev/null
MAIL_C_PRIMA=$(attendi 1 mail_a "$C@t.it")
MAIL_U1_PRIMA=$(mail_a "$U1@t.it"); MAIL_U2_PRIMA=$(mail_a "$U2@t.it")

echo
echo "=== A. password sbagliata ==="
assert_http "-> 400" 400 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{"password":"Sbagliata999!"}'
eq "nulla e' cambiato" "|attiva" "$(q "SELECT coalesce(eliminato_il::text,'')||'|'||(SELECT stato FROM collegamenti_commercialista WHERE id=$COLL1) FROM commercialisti WHERE id=$CID")"
assert_http "senza password -> 400" 400 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT" "${JSON[@]}" -d '{}'

echo
echo "=== B. token sbagliati ==="
assert_http "senza token -> 401" 401 -X DELETE "$API/commercialisti/account" "${JSON[@]}" -d "{\"password\":\"$PW\"}"
assert_http "token di un utente -> 401" 401 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $UT1" "${JSON[@]}" -d "{\"password\":\"$PW\"}"

echo
echo "=== C. eliminazione ==="
assert_http "-> 200" 200 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"password\":\"$PW\"}"
eq "collegamenti revocati: 2 (attivo e in attesa)" "2" "$(j "['collegamenti_revocati']" < "$T/body")"

echo
echo "=== D. lo studio non esiste piu' come account ==="
assert_http "vecchio token -> 401" 401 "$API/commercialisti/profile" -H "Authorization: Bearer $CT"
assert_http "vecchio token sulla chat -> 401" 401 "$API/messaggi?userId=$ID1" -H "Authorization: Bearer $CT"
assert_http "seconda eliminazione con lo stesso token -> 401" 401 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"password\":\"$PW\"}"
assert_http "login -> 401" 401 -X POST "$API/commercialisti/login" "${JSON[@]}" -d "{\"username\":\"$C\",\"password\":\"$PW\"}"
eq "riga anonimizzata (contatti tolti, nome tenuto)" "|||Studio S3 $SFX|!|1" \
  "$(q "SELECT coalesce(username,'')||'|'||coalesce(email,'')||'|'||coalesce(telefono,'')||coalesce(partita_iva,'')||'|'||ragione_sociale||'|'||password_hash||'|'||(eliminato_il IS NOT NULL)::int FROM commercialisti WHERE id=$CID")"
eq "link di reset annullati" "0" "$(q "SELECT count(*) FROM token_account WHERE commercialista_id=$CID AND usato_il IS NULL AND annullato_il IS NULL")"
curl -s -X POST "$API/commercialisti/password-dimenticata" "${JSON[@]}" -H "X-Forwarded-For: 10.3.0.2" -d "{\"identificativo\":\"$C\"}" -o /dev/null
curl -s -X POST "$API/commercialisti/password-dimenticata" "${JSON[@]}" -H "X-Forwarded-For: 10.3.0.3" -d "{\"identificativo\":\"$C@t.it\"}" -o /dev/null
sleep 2
eq "reset per il vecchio username/email: nessun link" "0" "$(q "SELECT count(*) FROM token_account WHERE commercialista_id=$CID AND annullato_il IS NULL")"
eq "e nessuna mail al vecchio indirizzo" "$MAIL_C_PRIMA" "$(mail_a "$C@t.it")"
eq "notifiche per lo studio in coda: nessuna" "0" "$(q "SELECT count(*) FROM notifiche n JOIN collegamenti_commercialista c ON c.id=n.collegamento_id WHERE c.commercialista_id=$CID AND n.destinatario_tipo='commercialista' AND n.stato='in_coda'")"
CT2=$(reg_c "$C" "Studio Nuovo $SFX")
eq "username ed email di nuovo liberi (registrazione)" "1" "$([ "$CT2" != "-" ] && [ -n "$CT2" ] && echo 1 || echo 0)"
NUOVO=$(cid "$C")
eq "e' un account diverso, senza collegamenti" "0" "$(q "SELECT count(*) FROM collegamenti_commercialista WHERE commercialista_id=$NUOVO")"
assert_http "il nuovo studio non vede il cliente di prima" 403 "$API/commercialisti/clienti/$ID1" -H "Authorization: Bearer $CT2"

echo
echo "=== E. i clienti ==="
eq "collegamenti chiusi con motivo, revocati dallo studio" "revocata|commercialista|Account dello studio eliminato revocata|commercialista|Account dello studio eliminato" \
  "$(q "SELECT string_agg(stato||'|'||revocato_da||'|'||motivo_revoca,' ' ORDER BY id) FROM collegamenti_commercialista WHERE id IN ($COLL1,$COLL2)")"
eq "il collegamento gia' revocato dal cliente non cambia" "revocata|user" "$(q "SELECT stato||'|'||revocato_da FROM collegamenti_commercialista WHERE id=$COLL3")"
eq "avviso al cliente attivo consegnato" "$((MAIL_U1_PRIMA + 1))" "$(attendi $((MAIL_U1_PRIMA + 1)) mail_a "$U1@t.it")"
eq "avviso al cliente in attesa consegnato" "$((MAIL_U2_PRIMA + 1))" "$(attendi $((MAIL_U2_PRIMA + 1)) mail_a "$U2@t.it")"
curl -s "$API/utenti/collegamenti" -H "Authorization: Bearer $UT1" > "$T/c.json"
eq "il cliente vede lo studio: nome, eliminato, senza contatti" "Studio S3 $SFX|True|None|None|None" \
  "$(python3 -c "import json;c=[x for x in json.load(open('$T/c.json'))['collegamenti'] if x['id']==$COLL1][0];print('|'.join(str(c[k]) for k in ('ragione_sociale','studio_eliminato','email','telefono','partita_iva')))" 2>&1)"
assert_http "registro degli accessi ancora leggibile" 200 "$API/utenti/collegamenti/$COLL1/accessi" -H "Authorization: Bearer $UT1"
eq "con tutte le righe" "$ACC_PRIMA" "$(j "['totale']" < "$T/body")"
eq "messaggi conservati" "$MSG_PRIMA" "$(q "SELECT count(*) FROM messaggi_commercialista WHERE collegamento_id=$COLL1")"
sleep 1
eq "allegato conservato (riga e file)" "1|1" "$(q "SELECT count(*) FROM allegati_messaggio WHERE chiave='$CHIAVE'")|$(su_disco "$CHIAVE")"
curl -s "$API/utenti/collegamenti" -H "Authorization: Bearer $UT3" -o "$T/c3.json"
eq "anche per il cliente che aveva gia' revocato" "True" "$(python3 -c "import json;print([x for x in json.load(open('$T/c3.json'))['collegamenti'] if x['id']==$COLL3][0]['studio_eliminato'])" 2>&1)"

echo
echo "=== F. gara: cinque eliminazioni simultanee ==="
C2="s3d$SFX"; CT3=$(reg_c "$C2" "Studio Gara")
for k in 1 2 3 4 5; do
  ( curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT3" "${JSON[@]}" -d "{\"password\":\"$PW\"}" > "$T/g$k" ) &
done
wait
eq "una 200, le altre 401" "200 401 401 401 401" "$(cat "$T"/g1 "$T"/g2 "$T"/g3 "$T"/g4 "$T"/g5 | sort | tr '\n' ' ' | sed 's/ $//')"

echo
echo "=== G. password vecchia ==="
C3="s3e$SFX"; CT4=$(reg_c "$C3" "Studio Cambio"); CID3=$(cid "$C3")
curl -s -X PUT "$API/commercialisti/password" -H "Authorization: Bearer $CT4" "${JSON[@]}" -d "{\"currentPassword\":\"$PW\",\"newPassword\":\"NuovaPass456!\"}" > "$T/cp.json"
CT4N=$(j "['token']" < "$T/cp.json")
assert_http "vecchia password con il token nuovo -> 400" 400 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT4N" "${JSON[@]}" -d "{\"password\":\"$PW\"}"
eq "account vivo" "" "$(q "SELECT coalesce(eliminato_il::text,'') FROM commercialisti WHERE id=$CID3")"
# Gara stretta: la password cambia mentre la richiesta aspetta il lock della riga.
( docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -q >/dev/null 2>&1 <<SQL
BEGIN;
SELECT 1 FROM commercialisti WHERE id=$CID3 FOR UPDATE;
SELECT pg_sleep(2);
UPDATE commercialisti SET password_hash = password_hash || 'x' WHERE id=$CID3;
COMMIT;
SQL
) &
sleep 0.7
assert_http "password cambiata mentre la richiesta aspetta il lock -> 400" 400 -X DELETE "$API/commercialisti/account" -H "Authorization: Bearer $CT4N" "${JSON[@]}" -d '{"password":"NuovaPass456!"}'
wait
eq "account ancora vivo" "" "$(q "SELECT coalesce(eliminato_il::text,'') FROM commercialisti WHERE id=$CID3")"

echo
echo "=== H. DELETE fisico ==="
eq "studio con collegamenti: rifiutato (FK)" "1" "$(qerr "DELETE FROM commercialisti WHERE id=$CID" | grep -c 'violates foreign key constraint')"
eq "i collegamenti ci sono ancora" "3" "$(q "SELECT count(*) FROM collegamenti_commercialista WHERE commercialista_id=$CID")"
eq "studio senza collegamenti: si cancella" "1" "$(qerr "DELETE FROM commercialisti WHERE id=$CID3" | grep -c 'DELETE 1')"
eq "vincolo: un account vivo ha username ed email" "1" "$(qerr "UPDATE commercialisti SET email=NULL WHERE id=$NUOVO" | grep -c chk_commercialisti_vivo_identificato)"

echo
echo "=== I. file orfani ==="
VECCHIO=$(date -v-3H +%Y%m%d%H%M 2>/dev/null || date -d '-3 hours' +%Y%m%d%H%M)
O1=$(openssl rand -hex 16); O2=$(openssl rand -hex 16); O3=$(openssl rand -hex 16); OD=$(openssl rand -hex 16)
echo x > "$ALLEGATI_DIR/$O1";      touch -t "$VECCHIO" "$ALLEGATI_DIR/$O1"       # vecchio, senza allegato
echo x > "$ALLEGATI_DIR/$O2.tmp";  touch -t "$VECCHIO" "$ALLEGATI_DIR/$O2.tmp"   # .tmp rimasto a meta'
echo x > "$ALLEGATI_DIR/$O3"                                                      # recente: upload in corso
echo x > "$ALLEGATI_DIR/LEGGIMI";  touch -t "$VECCHIO" "$ALLEGATI_DIR/LEGGIMI"   # nome non del backend
mkdir "$ALLEGATI_DIR/$OD";         touch -t "$VECCHIO" "$ALLEGATI_DIR/$OD"       # cartella con nome da chiave
touch -t "$VECCHIO" "$ALLEGATI_DIR/$CHIAVE"                                        # allegato vivo, vecchio
eq "orfano vecchio rimosso" "0" "$(attendi 0 su_disco "$O1")"
eq ".tmp vecchio rimosso" "0" "$(attendi 0 su_disco "$O2.tmp")"
sleep 1
eq "orfano recente lasciato" "1" "$(su_disco "$O3")"
eq "file con nome estraneo lasciato" "1" "$(su_disco LEGGIMI)"
eq "cartella lasciata" "1" "$([ -d "$ALLEGATI_DIR/$OD" ] && echo 1 || echo 0)"
eq "allegato vivo lasciato" "1" "$(su_disco "$CHIAVE")"
rm -f "${ALLEGATI_DIR:?}/LEGGIMI" "${ALLEGATI_DIR:?}/${O3:?}"; rmdir "${ALLEGATI_DIR:?}/${OD:?}"

echo
echo "=== K. rollback 010..007 e riapplicazione ==="
# Un secondo allegato su un collegamento attivo: il down della 007 lascia i file,
# la pulizia dopo la riapplicazione li toglie.
U4="s3x$SFX"; UT4=$(reg_u "$U4"); ID4=$(uid "$U4")
C4="s3f$SFX"; CT5=$(reg_c "$C4" "Studio K"); CID4=$(cid "$C4")
richiedi "$CT5" "$U4"; COLL4=$(coll_di "$CID4" "$ID4"); accetta "$UT4" "$COLL4"
hit -X POST "$API/messaggi/allegati?collegamentoId=$COLL4" -H "Authorization: Bearer $UT4" -F "file=@$T/doc.pdf;filename=k.pdf" >/dev/null
K2=$(q "SELECT a.chiave FROM allegati_messaggio a JOIN messaggi_commercialista m ON m.id=a.messaggio_id WHERE m.collegamento_id=$COLL4")
eq "secondo allegato su disco" "1" "$(su_disco "$K2")"
touch -t "$VECCHIO" "$ALLEGATI_DIR/$K2"
# Prima le migration successive alla 010 (si annulla solo l'ultima), poi 010..007.
ULTIMA=$(q "SELECT max(versione) FROM schema_migrazioni")
for v in $(q "SELECT string_agg(versione, ' ' ORDER BY versione DESC) FROM schema_migrazioni WHERE versione > '010'"); do migra annulla $v; done
rc=""; for v in 010 009 008 007; do migra annulla $v; rc="$rc$?"; done
eq "annulla 010, 009, 008, 007: exit 0" "0000" "$rc"
[ "$rc" = 0000 ] || tail -3 "$T/migra"
eq "studio eliminato dopo il down della 010: non accede" "#eliminato-$CID|#eliminato-$CID@eliminato.invalid|!" \
  "$(q "SELECT username||'|'||email||'|'||password_hash FROM commercialisti WHERE id=$CID")"
eq "FK tornata CASCADE" "c" "$(q "SELECT confdeltype FROM pg_constraint WHERE conname='collegamenti_commercialista_commercialista_id_fkey'")"
sleep 2
eq "senza tabelle degli allegati la pulizia non cancella" "1|1" "$(su_disco "$CHIAVE")|$(su_disco "$K2")"
if [ -n "$BACKEND_LOG" ]; then
  eq "e lo scrive nel log" "1" "$([ "$(grep -c 'pulizia allegati orfani: 42P01' "$BACKEND_LOG")" -gt 0 ] && echo 1 || echo 0)"
fi
migra; eq "riapplicate: exit 0" "0" "$?"
eq "registro di nuovo all'ultima ($ULTIMA)" "$ULTIMA" "$(q "SELECT max(versione) FROM schema_migrazioni")"
eq "lo studio torna eliminato" "||1" "$(q "SELECT coalesce(username,'')||'|'||coalesce(email,'')||'|'||(eliminato_il IS NOT NULL)::int FROM commercialisti WHERE id=$CID")"
eq "FK di nuovo RESTRICT" "r" "$(q "SELECT confdeltype FROM pg_constraint WHERE conname='collegamenti_commercialista_commercialista_id_fkey'")"
file_k() { echo "$(su_disco "$CHIAVE")|$(su_disco "$K2")"; }
eq "i file degli allegati tolti dal down della 007 spariscono" "0|0" "$(attendi "0|0" file_k)"

echo
echo "=== L. gara: consegna di una notifica ed eliminazione dello studio ==="
# scripts/smoke/s3-gara-notifiche.js con il codice del checkout, sulla stessa base.
# 1) eliminazione lanciata mentre la mail e' in spedizione: deve aspettare;
# 2) eliminazione con il lock gia' preso quando la consegna comincia: nessuna mail.
DBP=$(docker port "$DB_CONTAINER" 5432 2>/dev/null | head -1 | sed 's/.*://')
G=$(cd "$R/backend" && DB_HOST=127.0.0.1 DB_PORT="$DBP" DB_NAME="$DB_NAME" DB_USER=postgres DB_PASSWORD="$DB_PASSWORD" \
  perl -e 'alarm 60; exec @ARGV' node "$R/scripts/smoke/s3-gara-notifiche.js" 2>/dev/null | grep '^{' | tail -1)
gj() { printf '%s' "$G" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
eq "notifiche accodate per i due casi" "True|True" "$(gj "['caso1']['notifica_accodata']")|$(gj "['caso2']['notifica_accodata']")"
eq "caso 1: la mail parte a studio ancora vivo" "['studio']|False" "$(gj "['caso1']['mail']")|$(gj "['caso1']['eliminato_prima_di_inviare']")"
eq "caso 1: l'eliminazione non committa durante l'invio" "False" "$(gj "['caso1']['eliminato_durante_invio']")"
eq "caso 1: poi l'eliminazione riesce" "True|inviata" "$(gj "['caso1']['eliminato_alla_fine']")|$(gj "['caso1']['stato_notifica']")"
eq "caso 2: nessuna mail, notifica annullata" "[]|annullata" "$(gj "['caso2']['mail']")|$(gj "['caso2']['stato_notifica']")"

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
