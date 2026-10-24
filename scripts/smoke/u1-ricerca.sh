#!/usr/bin/env bash
# Smoke test del blocco U1 (fase UX, backend): ricerca, paginazione, indici.
#
#   A. id non interi nel percorso: 400, non 500 (aperto di K3);
#   B. GET /anagrafiche/cerca: tetto, piu' usate prima, prefisso prima, tipo,
#      % e _ come caratteri, solo i dati dell'utente, attive;
#   C. GET /anagrafiche/elenco: pagine, totale, indice A-Z, filtri, aggregati;
#   D. GET /movimenti: ordinamento richiesto applicato, cursore senza buchi ne'
#      doppioni anche con inserimenti in mezzo, saldo progressivo del conto;
#   E. suggerimenti delle categorie: % non e' un jolly;
#   F. migrazione 012: indici presenti e usati dal piano, rollback e riapplicazione;
#   G. copia della 012 nel chart.
#
#   API=http://localhost:3001/api DB_CONTAINER=prima_nota_db ./scripts/smoke/u1-ricerca.sh
#
# La sezione F toglie e rimette la 012 sul database indicato: solo database di prova.
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${API:-http://localhost:3001/api}"
DB_CONTAINER="${DB_CONTAINER:?DB_CONTAINER richiesto}"
DB_NAME="${DB_NAME:-prima_nota}"
DB_PASSWORD="${DB_PASSWORD:-pw}"
SFX="${SFX:-$(date +%s)$RANDOM}"
PW='Password123!'
T="$(mktemp -d)"; trap 'rm -rf "${T:?}"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
q()  { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1 | head -1; }
qa() { docker exec -i "$DB_CONTAINER" psql -X -U postgres -d "$DB_NAME" -tA -c "$1" 2>&1; }
hit() { curl -s --max-time 20 -o "$T/body" -w "%{http_code}" "$@"; }
py() { python3 -c "import sys,json;d=json.load(open('$T/body'));$1" 2>/dev/null || echo "-"; }
JSON=(-H "Content-Type: application/json")
migra() {
  docker run --rm --network "container:$DB_CONTAINER" -e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD="$DB_PASSWORD" \
    -e PGDATABASE="$DB_NAME" -v "$R/database:/database:ro" docker.io/library/postgres:16.15-bookworm bash /database/migra.sh "$@" > "$T/migra" 2>&1
}
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null; }

echo "=== setup (suffisso $SFX) ==="
eq "migrazione 012 applicata" "1" "$(q "SELECT count(*) FROM schema_migrazioni WHERE versione='012'")"
U="u1a$SFX"; V="u1b$SFX"
UT=$(reg_u "$U"); VT=$(reg_u "$V")
UID_=$(q "SELECT id FROM utenti WHERE username='$U'"); VID=$(q "SELECT id FROM utenti WHERE username='$V'")
AU=(-H "Authorization: Bearer $UT"); AV=(-H "Authorization: Bearer $VT")
# Conto di U con saldo iniziale 1000. 3.500 anagrafiche di U, nomi con iniziali
# diverse; alcune speciali; V ha un "Rossi" suo che U non deve mai vedere.
q "INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id) VALUES ('Banca U1', 'U', 1000, $UID_)" >/dev/null
CONTO=$(q "SELECT id FROM conti_correnti WHERE user_id=$UID_")
q "INSERT INTO anagrafiche (nome, user_id, attivo)
   SELECT chr(65 + (g % 26)) || 'nagrafica ' || g, $UID_, true FROM generate_series(1, 3500) g" >/dev/null
q "INSERT INTO anagrafiche (nome, piva, user_id, attivo, tipo_movimento_preferito) VALUES
   ('Rossi Mario', '11122233344', $UID_, true, 'Uscita'),
   ('Bianchi e Rossi srl', NULL, $UID_, true, 'Entrata'),
   ('Rossetti spenta', NULL, $UID_, false, NULL),
   ('Sconto 50% fisso', NULL, $UID_, true, NULL),
   ('Ètna servizi', NULL, $UID_, true, NULL),
   ('3M Italia', NULL, $UID_, true, NULL)" >/dev/null
q "INSERT INTO anagrafiche (nome, user_id, attivo) VALUES ('Rossi di V $SFX', $VID, true)" >/dev/null
TOT=$(q "SELECT count(*) FROM anagrafiche WHERE user_id=$UID_")
aid() { q "SELECT id FROM anagrafiche WHERE user_id=$UID_ AND nome='$1'"; }
ROSSI=$(aid 'Rossi Mario'); BIANCHI=$(aid 'Bianchi e Rossi srl'); A7=$(aid 'Hnagrafica 7')
# Uso: Bianchi 5 movimenti recenti, A7 2, Rossi 1. 40 movimenti in tutto sul conto.
q "INSERT INTO movimenti (data, anagrafica_id, conto_id, descrizione, importo, tipo, user_id)
   SELECT CURRENT_DATE - (g % 20), CASE WHEN g <= 5 THEN $BIANCHI WHEN g <= 7 THEN $A7 WHEN g = 8 THEN $ROSSI END,
          $CONTO, 'mov ' || g, 10 + g, CASE WHEN g % 3 = 0 THEN 'Uscita' ELSE 'Entrata' END, $UID_
   FROM generate_series(1, 40) g" >/dev/null
eq "dati di prova" "3506|40" "$TOT|$(q "SELECT count(*) FROM movimenti WHERE user_id=$UID_")"

echo
echo "=== A. id non interi nel percorso ==="
for r in "GET movimenti/abc" "GET anagrafiche/1.5" "GET conti-bancari/99999999999" "GET anagrafiche/tipologie/x" \
         "DELETE categorie-movimenti/abc" "PUT categorie-movimenti/-1" "GET anagrafiche/0/movimenti" "DELETE utenti/token-inviti/abc"; do
  set -- $r
  eq "$1 /$2 -> 400" "400" "$(hit -X "$1" "${AU[@]}" "${JSON[@]}" -d '{}' "$API/$2")"
done
CT=$(curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"u1c$SFX\",\"email\":\"u1c$SFX@t.it\",\"password\":\"$PW\",\"ragione_sociale\":\"Studio U1\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null)
eq "GET commercialisti/clienti/abc (studio) -> 400" "400" "$(hit -H "Authorization: Bearer $CT" "$API/commercialisti/clienti/abc")"
eq "id intero di un altro utente: ancora 404" "404" "$(hit "${AV[@]}" "$API/anagrafiche/$ROSSI")"
eq "id intero proprio: 200" "200" "$(hit "${AU[@]}" "$API/anagrafiche/$ROSSI")"

echo
echo "=== B. /anagrafiche/cerca ==="
eq "q vuoto -> 200" "200" "$(hit "${AU[@]}" "$API/anagrafiche/cerca")"
eq "  tetto predefinito 20, altri=true" "20|True" "$(py "print(str(len(d['risultati']))+'|'+str(d['altri']))")"
eq "  le piu' usate prima (Bianchi 5, Hnagrafica 7 2, Rossi 1)" "Bianchi e Rossi srl|Hnagrafica 7|Rossi Mario" \
  "$(py "print('|'.join(r['nome'] for r in d['risultati'][:3]))")"
eq "  movimenti_recenti" "5|2|1" "$(py "print('|'.join(str(r['movimenti_recenti']) for r in d['risultati'][:3]))")"
eq "limit=50 -> 50 righe" "50" "$(hit "${AU[@]}" "$API/anagrafiche/cerca?limit=50" >/dev/null; py "print(len(d['risultati']))")"
eq "limit=51 -> 400" "400" "$(hit "${AU[@]}" "$API/anagrafiche/cerca?limit=51")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=ross" >/dev/null
eq "q=ross: chi inizia con ross prima, poi chi lo contiene; spenta e di V escluse" "Rossi Mario|Bianchi e Rossi srl" \
  "$(py "print('|'.join(r['nome'] for r in d['risultati']))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=ROSS&tipo=Entrata" >/dev/null
eq "maiuscole indifferenti; tipo=Entrata: a parita' di prefisso decide il prefisso" "Rossi Mario|Bianchi e Rossi srl" \
  "$(py "print('|'.join(r['nome'] for r in d['risultati']))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?tipo=Uscita&limit=3" >/dev/null
eq "tipo=Uscita: prima uscita o senza tipo (Bianchi, di entrata, scende)" "Hnagrafica 7|Rossi Mario" \
  "$(py "print('|'.join(r['nome'] for r in d['risultati'][:2]))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=ross&solo_attive=false" >/dev/null
eq "solo_attive=false: anche la spenta" "3" "$(py "print(len(d['risultati']))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=%25" >/dev/null
eq "q=%: solo chi contiene davvero %" "Sconto 50% fisso" "$(py "print('|'.join(r['nome'] for r in d['risultati']))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=_" >/dev/null
eq "q=_: nessun jolly" "0" "$(py "print(len(d['risultati']))")"
hit "${AU[@]}" "$API/anagrafiche/cerca?q=11122" >/dev/null
eq "ricerca sulla partita IVA" "Rossi Mario" "$(py "print('|'.join(r['nome'] for r in d['risultati']))")"
hit "${AV[@]}" "$API/anagrafiche/cerca?q=ross" >/dev/null
eq "V vede solo la sua" "Rossi di V $SFX" "$(py "print('|'.join(r['nome'] for r in d['risultati']))")"
MS=$(python3 -c "import time,subprocess;t=time.time();[subprocess.run(['curl','-s','-o','/dev/null','-H','Authorization: Bearer $UT','$API/anagrafiche/cerca?q=agrafica%201'],check=True) for _ in range(5)];print(int((time.time()-t)*200))")
eq "tempo medio con 3.506 controparti < 300 ms ($MS ms)" "1" "$([ "$MS" -lt 300 ] && echo 1 || echo 0)"

echo
echo "=== C. /anagrafiche/elenco ==="
eq "prima pagina -> 200" "200" "$(hit "${AU[@]}" "$API/anagrafiche/elenco")"
eq "  50 righe, totale, altri" "50|$TOT|True" "$(py "print(str(len(d['anagrafiche']))+'|'+str(d['totale'])+'|'+str(d['altri']))")"
eq "  indice A-Z: somma = totale" "$TOT" "$(py "print(sum(l['n'] for l in d['lettere']))")"
eq "  iniziali non A-Z sotto #" "2" "$(py "print([l['n'] for l in d['lettere'] if l['lettera']=='#'][0])")"
eq "  ordine alfabetico senza maiuscole/minuscole" "1" "$(py "n=[r['nome'].lower() for r in d['anagrafiche']];print(int(n==sorted(n)))")"
LAST=$(( (TOT - 1) / 50 * 50 ))
hit "${AU[@]}" "$API/anagrafiche/elenco?offset=$LAST" >/dev/null
eq "ultima pagina: $((TOT - LAST)) righe, altri=false" "$((TOT - LAST))|False" "$(py "print(str(len(d['anagrafiche']))+'|'+str(d['altri']))")"
hit "${AU[@]}" "$API/anagrafiche/elenco?lettera=R&limit=100" >/dev/null
N_R=$(q "SELECT count(*) FROM anagrafiche WHERE user_id=$UID_ AND upper(left(nome,1))='R'")
eq "lettera=R: totale e indice intero" "$N_R|27" "$(py "print(str(d['totale'])+'|'+str(len(d['lettere'])))")"
hit "${AU[@]}" "$API/anagrafiche/elenco?lettera=%23" >/dev/null
eq "lettera=#: 3M e Ètna" "3M Italia|Ètna servizi" "$(py "print('|'.join(r['nome'] for r in d['anagrafiche']))")"
hit "${AU[@]}" "$API/anagrafiche/elenco?ordina=uso&limit=3" >/dev/null
EXP=$(q "SELECT count(*)||'|'||sum(importo) FILTER (WHERE tipo='Entrata')||'|'||coalesce(sum(importo) FILTER (WHERE tipo='Uscita'),0) FROM movimenti WHERE anagrafica_id=$BIANCHI")
eq "ordina=uso: Bianchi prima, aggregati come in SQL" "Bianchi e Rossi srl|$EXP" \
  "$(py "r=d['anagrafiche'][0];print(r['nome']+'|'+str(r['numero_movimenti'])+'|'+r['totale_entrate']+'|'+r['totale_uscite'])")"
hit "${AU[@]}" "$API/anagrafiche/elenco?attivo=false" >/dev/null
eq "attivo=false: solo la spenta" "Rossetti spenta" "$(py "print('|'.join(r['nome'] for r in d['anagrafiche']))")"
eq "limit=101 -> 400" "400" "$(hit "${AU[@]}" "$API/anagrafiche/elenco?limit=101")"
eq "lettera=ab -> 400" "400" "$(hit "${AU[@]}" "$API/anagrafiche/elenco?lettera=ab")"
hit "${AV[@]}" "$API/anagrafiche/elenco" >/dev/null
eq "V: solo la sua" "1" "$(py "print(d['totale'])")"

echo
echo "=== D. /movimenti ==="
hit "${AU[@]}" "$API/movimenti?order_by=importo&order_direction=ASC&limit=5" >/dev/null
eq "order_by=importo ASC applicato" "11.00|12.00|13.00|14.00|15.00" "$(py "print('|'.join(r['importo'] for r in d['movimenti']))")"
# Cursore: 40 righe a pagine da 7; dopo la prima pagina si inserisce un movimento
# piu' vecchio di tutti e uno piu' recente: nessuna riga saltata o ripetuta, e
# quello piu' vecchio compare (e' dopo il cursore), quello recente no.
VISTI=""; DOPO=""; GIRI=0
while :; do
  hit "${AU[@]}" "$API/movimenti?limit=7${DOPO:+&dopo=$DOPO}" >/dev/null
  VISTI="$VISTI $(py "print(' '.join(str(r['id']) for r in d['movimenti']))")"
  DOPO=$(py "print(d['pagination']['cursore'] or '')")
  GIRI=$((GIRI+1))
  if [ $GIRI -eq 1 ]; then
    q "INSERT INTO movimenti (data, conto_id, descrizione, importo, tipo, user_id) VALUES
       (CURRENT_DATE - 400, $CONTO, 'vecchio', 1, 'Entrata', $UID_), (CURRENT_DATE + 1, $CONTO, 'nuovo', 1, 'Entrata', $UID_)" >/dev/null
  fi
  [ -z "$DOPO" ] || [ $GIRI -gt 20 ] && break
done
ATTESI=$(qa "SELECT id FROM movimenti WHERE user_id=$UID_ AND descrizione <> 'nuovo' ORDER BY data DESC, id DESC" | tr '\n' ' ')
eq "cursore: tutte le righe, una volta, in ordine (41 righe, 6 pagine)" "$(echo $ATTESI)|6" "$(echo $VISTI)|$GIRI"
eq "cursore con order_by=importo -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?order_by=importo&dopo=2026-01-01_5")"
eq "cursore malformato -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?dopo=ieri")"
eq "cursore con data impossibile -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?dopo=2025-02-30_5")"
eq "cursore con mese 13 -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?dopo=2025-13-01_5")"
eq "cursore con id oltre INTEGER -> 400" "400" "$(hit "${AU[@]}" "$API/movimenti?dopo=2025-01-01_2147483648")"
eq "cursore al limite di INTEGER -> 200" "200" "$(hit "${AU[@]}" "$API/movimenti?dopo=2025-01-01_2147483647")"
hit "${AU[@]}" "$API/movimenti?conto_id=$CONTO&limit=1" >/dev/null
eq "saldo progressivo dell'ultimo movimento = calcola_saldo_conto" "$(q "SELECT calcola_saldo_conto($CONTO)")" "$(py "print(d['movimenti'][0]['saldo_progressivo'])")"
OLD=$(q "SELECT id FROM movimenti WHERE descrizione='vecchio' AND user_id=$UID_")
hit "${AU[@]}" "$API/movimenti?conto_id=$CONTO&order_direction=ASC&limit=1" >/dev/null
eq "saldo progressivo del primo = iniziale + 1" "$OLD|1001.00" "$(py "r=d['movimenti'][0];print(str(r['id'])+'|'+r['saldo_progressivo'])")"
hit "${AU[@]}" "$API/movimenti?conto_id=$CONTO&tipo=Uscita&limit=1" >/dev/null
MU=$(py "print(d['movimenti'][0]['id'])")
eq "con un filtro in piu': saldo del conto, non dei soli filtrati" \
  "$(q "SELECT 1000 + sum(CASE WHEN tipo='Entrata' THEN importo ELSE -importo END) FROM movimenti m WHERE conto_id=$CONTO AND (data, id) <= (SELECT data, id FROM movimenti WHERE id=$MU)")" \
  "$(py "print(d['movimenti'][0]['saldo_progressivo'])")"
hit "${AU[@]}" "$API/movimenti?limit=1" >/dev/null
eq "senza conto_id nessun saldo progressivo" "False" "$(py "print('saldo_progressivo' in d['movimenti'][0])")"
hit "${AV[@]}" "$API/movimenti?conto_id=$CONTO" >/dev/null
eq "conto di U chiesto da V: nessuna riga" "0" "$(py "print(len(d['movimenti']))")"

echo
echo "=== E. suggerimenti delle categorie ==="
q "INSERT INTO categorie_movimenti (nome, tipo, user_id) VALUES ('Affitto', 'Uscita', $UID_), ('IVA 22%', 'Uscita', $UID_)" >/dev/null
hit "${AU[@]}" "$API/categorie-movimenti/suggestions?q=%25%25" >/dev/null
eq "q=%%: nessun jolly" "0" "$(py "print(len(d))")"
hit "${AU[@]}" "$API/categorie-movimenti/suggestions?q=2%25" >/dev/null
eq "q=2%: chi contiene 2%" "IVA 22%" "$(py "print('|'.join(r['nome'] for r in d))")"

echo
echo "=== F. migrazione 012 ==="
q "ANALYZE anagrafiche, movimenti" >/dev/null   # statistiche fresche: 3.500 righe appena inserite
# Con il filtro per utente il pianificatore sceglie fra trigrammi e indice per
# utente secondo le statistiche; qui si prova che il LIKE con % iniziale ha un
# indice che lo serve (senza, solo scansione sequenziale).
PIANO=$(qa "SET enable_seqscan = off; EXPLAIN SELECT id FROM anagrafiche a WHERE lower(a.nome) LIKE '%agrafica 12%'")
eq "LIKE '%...%' servito dall'indice a trigrammi" "1" "$(echo "$PIANO" | grep -c idx_anagrafiche_nome_trgm)"
PIANO=$(qa "EXPLAIN SELECT id FROM movimenti m WHERE m.user_id = $UID_ AND (m.data, m.id) < ('2030-01-01', 1) ORDER BY m.data DESC, m.id DESC LIMIT 8")
eq "il piano del cursore usa idx_movimenti_user_data_id" "1" "$(echo "$PIANO" | grep -c idx_movimenti_user_data_id)"
ULTIMA=$(q "SELECT max(versione) FROM schema_migrazioni")
# Si annulla solo l'ultima: prima quelle successive alla 012, poi la 012.
annulla_012() {
  local v
  for v in $(q "SELECT string_agg(versione, ' ' ORDER BY versione DESC) FROM schema_migrazioni WHERE versione >= '012'"); do
    migra annulla "$v" || return 1
  done
}
annulla_012; eq "annulla 012 (e successive): exit 0" "0" "$?"
eq "indici tolti, pg_trgm resta" "0|1" "$(q "SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_anagrafiche_nome_trgm','idx_anagrafiche_user_nome','idx_movimenti_user_data_id','idx_movimenti_conto_data_id')")|$(q "SELECT count(*) FROM pg_extension WHERE extname='pg_trgm'")"
eq "senza indici la ricerca funziona" "200" "$(hit "${AU[@]}" "$API/anagrafiche/cerca?q=ross")"
migra; eq "riapplicata: exit 0" "0" "$?"
eq "indici di nuovo presenti, registro all'ultima ($ULTIMA)" "4|$ULTIMA" "$(q "SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_anagrafiche_nome_trgm','idx_anagrafiche_user_nome','idx_movimenti_user_data_id','idx_movimenti_conto_data_id')")|$(q "SELECT max(versione) FROM schema_migrazioni")"

echo
echo "=== G. chart ==="
eq "012 copiata nel chart" "0" "$("$R/scripts/sincronizza-helm-db.sh" --verifica >/dev/null 2>&1; echo $?)"

echo
echo "================================================"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
