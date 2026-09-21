#!/usr/bin/env bash
# Smoke test del workflow di collegamento utente <-> commercialista (blocco W1).
#
# Verifica la macchina a stati introdotta dalla migration 002 e il middleware
# requireCollegamento: chi non ha un collegamento `attiva` non vede nulla,
# ogni transizione non ammessa risponde 409, l'ambito viene validato.
#
# Prerequisiti: backend in ascolto su $API, database di prova raggiungibile
# tramite il container indicato in $DB_CONTAINER.
#
#   API=http://localhost:3009/api DB_CONTAINER=pn-w1-db ./scripts/smoke/w1-collegamento.sh
#
# Il database va ricreato prima di ogni esecuzione (lo script registra utenti
# con username fissi).

set -u
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:-prima_nota_db}"
DB_NAME="${DB_NAME:-prima_nota}"

psql_q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" "$@"; }

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }
code() { echo "$1" | tail -1; }
hit() { curl -s -o /tmp/body -w "%{http_code}" "$@"; }

echo "=== setup ==="
UT=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"username":"vittima","email":"v@t.it","password":"Password123!"}' | j "['token']")
CT=$(curl -s -X POST $API/commercialisti/register -H 'Content-Type: application/json' -d '{"username":"comm1","email":"c1@t.it","password":"Password123!","ragione_sociale":"Studio Uno"}' | j "['token']")
C2=$(curl -s -X POST $API/commercialisti/register -H 'Content-Type: application/json' -d '{"username":"comm2","email":"c2@t.it","password":"Password123!","ragione_sociale":"Studio Due"}' | j "['token']")
CLI=$(curl -s $API/auth/profile -H "Authorization: Bearer $UT" | j "['id']")
echo "user_id=$CLI  token utente ok=$([ -n "$UT" ] && echo si)  comm ok=$([ -n "$CT" ] && echo si)"
curl -s -X POST $API/conti-bancari -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"nome_banca":"Banca Test","intestatario":"Vittima","saldo_iniziale":1000}' >/dev/null
CONTO=$(curl -s $API/conti-bancari -H "Authorization: Bearer $UT" | j "[0]['id']")
echo "conto_id=$CONTO"

echo
echo "=== 1. token 365 giorni rifiutato (max 30) ==="
S=$(hit -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"giorni_validita":365}'); echo "HTTP $S  $(cat /tmp/body | head -c 150)"

echo
echo "=== 2. token default 7 giorni ==="
TOK=$(curl -s -X POST $API/utenti/genera-token-invito -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{}' | j "['token']")
echo "token=${TOK:0:12}...  scadenza=$(psql_q -t -A -c "SELECT (scadenza::date - now()::date)||' giorni' FROM token_inviti ORDER BY id DESC LIMIT 1")"

echo
echo "=== 3. commercialista usa il token -> richiesta in_attesa, NON accesso ==="
S=$(hit -X POST $API/commercialisti/collega-cliente -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d "{\"token\":\"$TOK\"}"); echo "HTTP $S  $(cat /tmp/body)"

echo
echo "=== 4. con richiesta in_attesa il commercialista NON vede i dati ==="
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "GET  clienti/$CLI  -> HTTP $S  $(cat /tmp/body | head -c 140)"
S=$(hit -X DELETE $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "DEL  clienti/$CLI  -> HTTP $S  $(cat /tmp/body | head -c 140)"
S=$(hit -X POST $API/commercialisti/clienti/$CLI/export -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d '{"export_type":"semplice","tutto_storico":true}'); echo "POST export       -> HTTP $S  $(cat /tmp/body | head -c 140)"
S=$(hit "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT"); echo "GET  messaggi     -> HTTP $S  $(cat /tmp/body | head -c 140)"

echo
echo "=== 5. commercialista estraneo (comm2, nessun collegamento) ==="
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $C2"); echo "GET  clienti/$CLI  -> HTTP $S  $(cat /tmp/body | head -c 120)"
S=$(hit -X DELETE $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $C2"); echo "DEL  clienti/$CLI  -> HTTP $S  $(cat /tmp/body | head -c 120)"

echo
echo "=== 6. l'utente vede la richiesta ==="
curl -s $API/utenti/collegamenti -H "Authorization: Bearer $UT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('in_attesa:',d['in_attesa']);[print(' ',c['id'],c['stato'],c['ragione_sociale'],'richiesto_da='+str(c['richiesto_da'])) for c in d['collegamenti']]"
COL=$(curl -s $API/utenti/collegamenti -H "Authorization: Bearer $UT" | j "['collegamenti'][0]['id']")

echo
echo "=== 7. ambito con conto non posseduto -> 400 ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/accetta -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"conti_ammessi":[9999]}'); echo "HTTP $S  $(cat /tmp/body | head -c 120)"

echo
echo "=== 8. ambito con date invertite -> 400 (Joi) ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/accetta -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"ambito_dal":"2025-01-01","ambito_al":"2024-01-01"}'); echo "HTTP $S  $(cat /tmp/body | head -c 160)"

echo
echo "=== 9. accettazione con ambito -> attiva ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/accetta -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d "{\"ambito_dal\":\"2025-01-01\",\"conti_ammessi\":[$CONTO]}"); echo "HTTP $S  $(cat /tmp/body)"
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "GET clienti/$CLI -> HTTP $S  cliente=$(cat /tmp/body | j "['cliente']['username']")"

echo
echo "=== 10. sospensione (reversibile) ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/sospendi -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"motivo":"sto sistemando marzo"}'); echo "PUT sospendi -> HTTP $S"
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "GET clienti  -> HTTP $S  $(cat /tmp/body)"
S=$(hit "$API/messaggi?userId=$CLI" -H "Authorization: Bearer $CT"); echo "GET messaggi -> HTTP $S  $(cat /tmp/body | head -c 120)"

echo
echo "=== 11. riattivazione ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/riattiva -H "Authorization: Bearer $UT"); echo "PUT riattiva -> HTTP $S"
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "GET clienti  -> HTTP $S"

echo
echo "=== 12. chat + conteggio non letti in dashboard (bug unread_messages) ==="
curl -s -X POST $API/messaggi -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"messaggio":"primo"}' >/dev/null
curl -s -X POST $API/messaggi -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"messaggio":"secondo"}' >/dev/null
echo "unread-count: $(curl -s $API/messaggi/unread-count -H "Authorization: Bearer $CT" | j "['unread_count']")"
curl -s $API/commercialisti/dashboard -H "Authorization: Bearer $CT" | python3 -c "import sys,json;d=json.load(sys.stdin);[print('  dashboard:',c['username'],'stato='+c['stato'],'unread_messages='+str(c['unread_messages'])) for c in d['clienti']]"

echo
echo "=== 13. revoca da parte dell'utente ==="
S=$(hit -X DELETE $API/utenti/collegamenti/$COL -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"motivo":"cambio studio"}'); echo "DELETE -> HTTP $S  $(cat /tmp/body)"
S=$(hit $API/commercialisti/clienti/$CLI -H "Authorization: Bearer $CT"); echo "GET clienti -> HTTP $S  $(cat /tmp/body)"

echo
echo "=== 14. transizione non ammessa: accettare un collegamento revocato ==="
S=$(hit -X PUT $API/utenti/collegamenti/$COL/accetta -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{}'); echo "HTTP $S  $(cat /tmp/body)"
S=$(hit -X PUT $API/utenti/collegamenti/$COL/riattiva -H "Authorization: Bearer $UT"); echo "riattiva revocato -> HTTP $S  $(cat /tmp/body | head -c 120)"

echo
echo "=== 15. collegamento di un altro utente non e' accessibile ==="
U2=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"username":"altro","email":"a@t.it","password":"Password123!"}' | j "['token']")
S=$(hit -X PUT $API/utenti/collegamenti/$COL/accetta -H "Authorization: Bearer $U2" -H 'Content-Type: application/json' -d '{}'); echo "HTTP $S  $(cat /tmp/body)"

echo
echo "=== 16. stato finale in DB ==="
psql_q -c "SELECT id, commercialista_id AS cid, user_id AS uid, stato, attivo, richiesto_da, revocato_da, motivo_revoca, ambito_dal, conti_ammessi FROM collegamenti_commercialista ORDER BY id;"
