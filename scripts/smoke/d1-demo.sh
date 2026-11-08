#!/usr/bin/env bash
# Smoke del blocco D1: dati dimostrativi (database/demo/demo.sql) e chart con demo.enabled.
#   DB_CONTAINER=pn-u7b-db API=http://127.0.0.1:33490/api ./scripts/smoke/d1-demo.sh
# Il backend di API deve usare il database prima_nota_demo del container.
set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_CONTAINER="${DB_CONTAINER:?}"; API="${API:?}"
PASS=0; FAIL=0
eq() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  OK    $1"; else FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; fi; }
q() { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "${2:-prima_nota_demo}" -tA -c "$1" 2>&1 | head -1; }
carica() { docker cp "$R/database/demo/demo.sql" "$DB_CONTAINER:/tmp/demo.sql" >/dev/null && docker exec "$DB_CONTAINER" psql -X -U postgres -d "$1" -f /tmp/demo.sql 2>&1; }
login() { curl -s -m15 -X POST "$API/$1/login" -H 'Content-Type: application/json' -d "{\"username\":\"$2\",\"password\":\"prova2026\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null; }

echo "=== A. guardia: mai fuori da prima_nota_demo ==="
docker exec "$DB_CONTAINER" psql -U postgres -tAc "DROP DATABASE IF EXISTS d1_altro" -c "CREATE DATABASE d1_altro" >/dev/null
q "CREATE TABLE utenti (id int); INSERT INTO utenti VALUES (1),(2)" d1_altro >/dev/null
OUT=$(carica d1_altro)
eq "su un altro database si ferma col motivo" "1" "$(echo "$OUT" | grep -c 'atteso "prima_nota_demo": nessun azzeramento')"
eq "e non tocca niente" "2" "$(q 'SELECT count(*) FROM utenti' d1_altro)"
docker exec "$DB_CONTAINER" psql -U postgres -tAc "DROP DATABASE d1_altro" >/dev/null

echo "=== B. carico due volte (azzeramento notturno) ==="
q "INSERT INTO utenti (username, email, password_hash) VALUES ('estraneo', 'e@x.it', 'x')" >/dev/null
eq "primo giro" "1" "$(carica prima_nota_demo | grep -c 'demo pronta: 10 clienti')"
N1=$(q "SELECT count(*) FROM movimenti")
eq "secondo giro" "1" "$(carica prima_nota_demo | grep -c 'demo pronta: 10 clienti')"
eq "stessi movimenti (seme fisso)" "$N1" "$(q 'SELECT count(*) FROM movimenti')"
eq "account aggiunti nel frattempo tolti" "0" "$(q "SELECT count(*) FROM utenti WHERE username='estraneo'")"
eq "id ripartiti da 1" "1" "$(q "SELECT min(id) FROM utenti")"
eq "dodici mesi fino a oggi, niente nel futuro" "0|12" "$(q "SELECT count(*) FILTER (WHERE data > CURRENT_DATE)||'|'||count(DISTINCT date_trunc('month', data)) FROM movimenti")"
eq "nessun conto in negativo" "0" "$(q "SELECT count(*) FROM conti_correnti WHERE calcola_saldo_conto(id) < 0")"
eq "righe dello stesso mese diverse fra loro" "0" "$(q "SELECT count(*) FROM (SELECT conto_id, data, importo, anagrafica_id FROM movimenti GROUP BY 1,2,3,4 HAVING count(*) > 1) x")"
eq "collegamenti: 8 attivi, 1 in attesa" "8|1" "$(q "SELECT count(*) FILTER (WHERE stato='attiva')||'|'||count(*) FILTER (WHERE stato='in_attesa') FROM collegamenti_commercialista")"
eq "nessuna notifica in coda" "0" "$(q 'SELECT count(*) FROM notifiche')"

echo "=== C. backend ==="
UT=$(login auth bar.centrale); ST=$(login commercialisti studio)
eq "login di un cliente" "1" "$([ -n "$UT" ] && echo 1)"
eq "login dello studio" "1" "$([ -n "$ST" ] && echo 1)"
eq "password sbagliata rifiutata" "" "$(curl -s -m15 -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"username":"bar.centrale","password":"no"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")"
eq "riepilogo del cliente: saldo = somma dei conti" "True" "$(curl -s -m15 "$API/reports/riepilogo" -H "Authorization: Bearer $UT" | python3 -c "import sys,json;from decimal import Decimal as D;d=json.load(sys.stdin);print(D(d['saldo_totale'])==sum(D(c['saldo']) for c in d['conti']) and d['da_chiarire']==1)")"
eq "da fare dello studio: rivedere 1, attesa 3, messaggi 2" "1|3|2" "$(curl -s -m15 "$API/commercialisti/da-fare" -H "Authorization: Bearer $ST" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['rivedere']),len(d['attesa']),len(d['messaggi']),sep='|')")"

echo "=== D. chart ==="
C="$R/helm-chart"
eq "demo spenta: nessuna risorsa della demo" "0" "$(helm template x "$C" 2>/dev/null | grep -c 'component: demo')"
eq "demo accesa sul database vero: il chart si ferma" "1" "$(helm template x "$C" --set demo.enabled=true 2>&1 | grep -c 'deve chiamarsi prima_nota_demo')"
REND=$(helm template x "$C" --set demo.enabled=true --set cloudnativepg.cluster.bootstrap.database=prima_nota_demo 2>&1)
eq "demo accesa: ConfigMap, Job hook e CronJob" "1|1|1" "$(echo "$REND" | grep -c '^  name: x-simple-prima-nota-demo$')|$(echo "$REND" | grep -c 'name: x-simple-prima-nota-demo-carica')|$(echo "$REND" | grep -c '^kind: CronJob')"
eq "copia nel chart allineata" "0" "$("$R/scripts/sincronizza-helm-db.sh" --verifica >/dev/null; echo $?)"
echo; echo "PASS $PASS   FAIL $FAIL"; [ "$FAIL" -eq 0 ]
