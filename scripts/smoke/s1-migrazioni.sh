#!/usr/bin/env bash
# Smoke test delle migrazioni versionate (blocco S1, database/migra.sh).
#
# Crea da se' i database di prova (container postgres:16.1 su una rete docker
# dedicata) e fa girare le migrazioni come le fanno i deploy: dentro un container
# postgres, con i file montati. Verifica:
#   A. database vuoto: init + 001..N, schema identico a quello costruito a mano;
#   B. seconda esecuzione: nulla da fare;
#   C. database creato dal vecchio docker-compose (init + 001..007, con dati):
#      riconosciuto, applicata solo la 008, dati intatti;
#   D. database di `main` (solo init.sql di main, con dati): riconosciuto come 000,
#      applicate 001..N, dati intatti, schema identico al riferimento;
#   E. tre esecuzioni concorrenti su un database vuoto: ogni migrazione una volta;
#   F. migrazione applicata e poi modificata: ci si ferma;
#   G. migrazione che fallisce: niente di parziale, niente registrato, le
#      successive non partono;
#   H. database con una migrazione sconosciuta ai file: ci si ferma;
#   I. init.sql mai su un database che ha gia' utenti;
#   J. database legacy con schema "a buchi": ci si ferma senza registrare;
#   K. annulla: solo l'ultima, con il suo _down, poi riapplicabile;
#   L. Helm: il job renderizzato da `helm template`, eseguito con i file della sua
#      ConfigMap, porta un database di main alla versione corrente;
#   M. docker-compose: il servizio di migrazione, eseguito come da `compose config`,
#      fa lo stesso; il backend parte solo dopo;
#   N. la copia dei file nel chart e' allineata a database/.
#
#   ./scripts/smoke/s1-migrazioni.sh            (dal repo; servono docker e helm)
#
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$R"
NET="pn-s1-net-$$"
IMG=docker.io/library/postgres:16.1
PFX="pn-s1-$$"
T=$(mktemp -d)
ULTIMA=$(ls database/migrations/[0-9][0-9][0-9]_*.sql | grep -v '_down.sql$' | tail -1 | xargs basename | cut -c1-3)
TOTALE=$(( 10#$ULTIMA + 1 ))   # 000..ULTIMA

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
contiene() { if grep -q -- "$2" "$3"; then ok "$1"; else ko "$1" "messaggio con '$2'" "$(tr '\n' ' ' < "$3" | head -c 300)"; fi; }

pulizia() {
  docker ps -aq --filter "name=^$PFX-" | xargs -r docker rm -f >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$T"
}
trap pulizia EXIT
docker network create "$NET" >/dev/null

nuovo_db() {
  docker run -d --name "$PFX-$1" --network "$NET" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=prima_nota "$IMG" >/dev/null
  local i
  for i in $(seq 1 60); do
    docker exec "$PFX-$1" pg_isready -q -U postgres -d prima_nota 2>/dev/null \
      && docker exec "$PFX-$1" psql -U postgres -d prima_nota -tAc 'select 1' >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "database $1 non partito"; exit 1
}
q()  { docker exec -i "$PFX-$1" psql -X -U postgres -d prima_nota -tA -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
# Applica un file sql a mano, come facevano i vecchi deploy.
sql_file() { grep -v '^\\c' "$2" | docker exec -i "$PFX-$1" psql -X -q -U postgres -d prima_nota -v ON_ERROR_STOP=1 >/dev/null 2>&1; }
# migra <db> <cartella> [argomenti...] -> uscita in $T/out, codice in $RC
migra() {
  local db="$1" dir="$2"; shift 2
  docker run --rm --network "$NET" -e PGHOST="$PFX-$db" -e PGUSER=postgres -e PGPASSWORD=pw -e PGDATABASE=prima_nota \
    -v "$dir:/database:ro" "$IMG" bash /database/migra.sh "$@" > "$T/out" 2>&1
  RC=$?
}
# Schema senza il registro e senza righe di servizio: confrontabile fra database.
schema() {
  docker exec "$PFX-$1" pg_dump -s -x -O -U postgres -d prima_nota -T schema_migrazioni \
    | grep -vE '^(--|SET |SELECT pg_catalog.set_config)' | sed '/^$/d'
}
registro() { q "$1" "SELECT string_agg(versione||':'||origine, ' ' ORDER BY versione) FROM schema_migrazioni"; }
n_eseguite() { q "$1" "SELECT count(*) FROM schema_migrazioni WHERE origine='eseguita'"; }
versione() { q "$1" "SELECT max(versione) FROM schema_migrazioni"; }
impronta_dati() { q "$1" "SELECT md5(string_agg(username||email||password_hash, ',' ORDER BY id)) FROM utenti"; }
semina_utenti() {  # due utenti non demo, per vedere che i dati sopravvivono
  q "$1" "INSERT INTO utenti (username, password_hash, email) VALUES
          ('s1uno', '\$2b\$10\$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu', 's1uno@t.it'),
          ('s1due', '\$2b\$10\$abcdefghijklmnopqrstuvvvvvvvvvvvvvvvvvvvvvvvvvvvvv', 's1due@t.it')" >/dev/null
}
seq_attesa() {  # registro atteso per un database vuoto: "000:eseguita ... NNN:eseguita"
  local o="" i; for i in $(seq 0 $((TOTALE - 1))); do o="$o $(printf '%03d' $i):$1"; done; echo "${o# }"
}

echo "=== riferimento: init.sql + 001..$ULTIMA applicati a mano ==="
nuovo_db rif
sql_file rif database/init.sql
for f in database/migrations/[0-9][0-9][0-9]_*.sql; do case $f in *_down.sql) continue;; esac; sql_file rif "$f" || echo "  (riferimento: $f fallita)"; done
schema rif > "$T/rif.sql"
eq "riferimento costruito" "1" "$([ -s "$T/rif.sql" ] && echo 1 || echo 0)"

echo "=== A. database vuoto ==="
nuovo_db a
migra a "$R/database"
eq "exit 0" "0" "$RC"
eq "registro 000..$ULTIMA tutte eseguite" "$(seq_attesa eseguita)" "$(registro a)"
schema a > "$T/a.sql"
eq "schema identico al riferimento" "" "$(diff "$T/rif.sql" "$T/a.sql" | head -5)"
contiene "messaggio finale" "schema aggiornato alla $ULTIMA ($TOTALE applicate ora)" "$T/out"

echo "=== B. seconda esecuzione ==="
migra a "$R/database"
eq "exit 0" "0" "$RC"
contiene "niente da fare" "($ULTIMA)\|0 applicate ora" "$T/out"
eq "registro invariato" "$TOTALE" "$(q a 'SELECT count(*) FROM schema_migrazioni')"

echo "=== C. database del vecchio docker-compose (init + 001..007, con dati) ==="
nuovo_db c
sql_file c database/init.sql
for f in database/migrations/00[1-7]_*.sql; do case $f in *_down.sql) continue;; esac; sql_file c "$f"; done
semina_utenti c
PRIMA=$(impronta_dati c)
migra c "$R/database"
eq "exit 0" "0" "$RC"
contiene "riconosciuto" "rilevate 000 001 002 003 004 005 006 007$" "$T/out"
eq "008 eseguita, il resto rilevato" "000:rilevata 001:rilevata 002:rilevata 003:rilevata 004:rilevata 005:rilevata 006:rilevata 007:rilevata 008:eseguita" \
  "$(q c "SELECT string_agg(versione||':'||origine, ' ' ORDER BY versione) FROM schema_migrazioni WHERE versione <= '008'")"
eq "utenti intatti" "$PRIMA" "$(impronta_dati c)"
schema c > "$T/c.sql"
eq "schema identico al riferimento" "" "$(diff "$T/rif.sql" "$T/c.sql" | head -5)"

echo "=== D. database di main (init.sql di main, con dati) ==="
git show main:database/init.sql > "$T/init-main.sql" 2>/dev/null
eq "init.sql di main disponibile" "1" "$([ -s "$T/init-main.sql" ] && echo 1 || echo 0)"
nuovo_db d
sql_file d "$T/init-main.sql"
semina_utenti d
PRIMA=$(impronta_dati d)
migra d "$R/database"
eq "exit 0" "0" "$RC"
[ "$RC" = 0 ] || sed 's/^/         | /' "$T/out" | tail -5
contiene "riconosciuto come 000" "rilevate 000$" "$T/out"
eq "versione finale" "$ULTIMA" "$(versione d)"
eq "utenti intatti" "$PRIMA" "$(impronta_dati d)"
eq "gen_random_bytes disponibile (token d'invito)" "8" "$(q d "SELECT length(encode(gen_random_bytes(4),'hex'))")"
schema d > "$T/d.sql"
eq "schema identico al riferimento" "" "$(diff "$T/rif.sql" "$T/d.sql" | head -5)"

echo "=== E. tre esecuzioni concorrenti su un database vuoto ==="
nuovo_db e
for k in 1 2 3; do
  ( docker run --rm --network "$NET" -e PGHOST="$PFX-e" -e PGUSER=postgres -e PGPASSWORD=pw -e PGDATABASE=prima_nota \
      -v "$R/database:/database:ro" "$IMG" bash /database/migra.sh > "$T/e$k" 2>&1; echo $? > "$T/e$k.rc" ) &
done
wait
eq "tutte e tre exit 0" "0 0 0" "$(cat "$T/e1.rc") $(cat "$T/e2.rc") $(cat "$T/e3.rc")"
eq "ogni migrazione eseguita una sola volta" "$TOTALE" "$(n_eseguite e)"
eq "applicate in tutto (somma dei tre)" "$TOTALE" "$(cat "$T"/e1 "$T"/e2 "$T"/e3 | grep -c ' applicata$')"
schema e > "$T/e.sql"
eq "schema identico al riferimento" "" "$(diff "$T/rif.sql" "$T/e.sql" | head -5)"

echo "=== F. migrazione applicata e poi modificata ==="
cp -R "$R/database" "$T/modificata"
echo "-- ritocco" >> "$T/modificata/migrations/003_invito_irrigidito.sql"
migra a "$T/modificata"
eq "exit diverso da 0" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "dice quale e perche'" "003 (invito_irrigidito) e' gia' applicata ma il file e' cambiato" "$T/out"

echo "=== G. migrazione che fallisce ==="
cp -R "$R/database" "$T/rotta"
printf 'BEGIN;\nCREATE TABLE s1_parziale (id INTEGER);\nSELECT 1/0;\nCOMMIT;\n' > "$T/rotta/migrations/900_rotta.sql"
printf 'CREATE TABLE s1_dopo (id INTEGER);\n' > "$T/rotta/migrations/901_dopo.sql"
migra a "$T/rotta"
eq "exit diverso da 0" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "dice quale" "900 (rotta) fallita" "$T/out"
eq "nessun oggetto parziale" "" "$(q a "SELECT to_regclass('public.s1_parziale')")"
eq "non registrata" "0" "$(q a "SELECT count(*) FROM schema_migrazioni WHERE versione='900'")"
eq "la successiva non e' partita" "" "$(q a "SELECT to_regclass('public.s1_dopo')")"

echo "=== H. database con una migrazione sconosciuta ai file ==="
q a "INSERT INTO schema_migrazioni (versione, nome, checksum, origine) VALUES ('950','futura',repeat('0',64),'eseguita')" >/dev/null
migra a "$R/database"
eq "exit diverso da 0" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "dice quale" "non conoscono: 950" "$T/out"
q a "DELETE FROM schema_migrazioni WHERE versione='950'" >/dev/null

echo "=== I. init.sql mai su un database con utenti ==="
semina_utenti a
PRIMA=$(impronta_dati a)
q a "DELETE FROM schema_migrazioni WHERE versione='000'" >/dev/null
migra a "$R/database"
eq "exit diverso da 0" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "rifiuta init" "init.sql su un database che ha gia' utenti" "$T/out"
eq "utenti intatti" "$PRIMA" "$(impronta_dati a)"
eq "000 non registrata" "0" "$(q a "SELECT count(*) FROM schema_migrazioni WHERE versione='000'")"
q a "INSERT INTO schema_migrazioni (versione, nome, checksum, origine) VALUES ('000','init','$(shasum -a 256 database/init.sql | cut -c1-64)','eseguita')" >/dev/null

echo "=== J. database legacy con schema a buchi ==="
nuovo_db j
sql_file j database/init.sql
for f in database/migrations/00[1-4]_*.sql; do case $f in *_down.sql) continue;; esac; sql_file j "$f"; done
q j "DROP INDEX idx_token_stato" >/dev/null     # impronta della 003 assente, 004 presente
migra j "$R/database"
eq "exit diverso da 0" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "dice perche'" "schema non riconoscibile" "$T/out"
eq "nessun registro creato" "" "$(q j "SELECT to_regclass('public.schema_migrazioni')")"
eq "nessuna migrazione eseguita (niente 005)" "" "$(q j "SELECT to_regclass('public.accessi_commercialista')")"

echo "=== K. annulla ==="
migra a "$R/database" annulla 007
eq "non l'ultima -> rifiutato" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
contiene "dice perche'" "007 non e' l'ultima" "$T/out"
migra a "$R/database" annulla "$ULTIMA"
eq "annulla $ULTIMA exit 0" "0" "$RC"
eq "registro alla versione precedente" "$(printf '%03d' $((10#$ULTIMA - 1)))" "$(versione a)"
eq "oggetti della $ULTIMA tolti (token_account)" "" "$(q a "SELECT to_regclass('public.token_account')")"
migra a "$R/database"
eq "riapplicata" "0|$ULTIMA" "$RC|$(versione a)"
schema a > "$T/a2.sql"
eq "schema di nuovo identico al riferimento" "" "$(diff "$T/rif.sql" "$T/a2.sql" | head -5)"

echo "=== L. Helm: il job renderizzato, con i file della sua ConfigMap ==="
for modo in "" "--set cloudnativepg.enabled=false --set postgresql.enabled=true" \
            "--set cloudnativepg.enabled=false --set externalDatabase.enabled=true --set externalDatabase.host=x"; do
  helm template t helm-chart $modo > "$T/helm.yaml" 2>"$T/helm.err"
  eq "helm template ${modo:-(default)}" "0" "$?"
done
helm template t helm-chart > "$T/helm.yaml" 2>/dev/null
# Estrae il job che tocca lo schema, ne ricostruisce i volumi da ConfigMap e lo
# esegue in docker verso il database di prova: stesso comando, stessi file.
uv run -q --with pyyaml python - "$T/helm.yaml" "$T/job" > "$T/job.env" <<'PY'
import sys, os, yaml, shlex
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
cms = {d['metadata']['name']: d.get('data', {}) for d in docs if d['kind'] == 'ConfigMap'}
jobs = [d for d in docs if d['kind'] == 'Job'
        and any(k in d['metadata']['name'] for k in ('migrazioni', 'db-init'))]
if not jobs:
    print('NESSUN_JOB=1'); sys.exit(0)
job = jobs[0]; spec = job['spec']['template']['spec']; c = spec['containers'][0]
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
vols = {v['name']: v for v in spec.get('volumes', [])}
mounts = []
for m in c.get('volumeMounts', []):
    v = vols[m['name']]; cm = cms[v['configMap']['name']]
    base = os.path.join(out, m['name']); os.makedirs(base, exist_ok=True)
    items = v['configMap'].get('items') or [{'key': k, 'path': k} for k in cm]
    for it in items:
        p = os.path.join(base, it['path']); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w').write(cm[it['key']])
    mounts.append(f"{base}:{m['mountPath']}:ro")
env = {e['name']: e['value'] for e in c.get('env', []) if 'value' in e}
q = shlex.quote
print('JOB_HOOK=' + q(job['metadata'].get('annotations', {}).get('helm.sh/hook', '')))
print('JOB_IMAGE=' + q(c['image']))
print('JOB_CMD=' + q(' '.join(q(x) for x in (c.get('command') or []) + (c.get('args') or []))))
print('JOB_MOUNTS=' + q(' '.join(mounts)))
print('JOB_ENV=' + q(' '.join(f'{k}={v}' for k, v in env.items() if k not in ('PGHOST', 'DB_HOST'))))
PY
NESSUN_JOB=0; . "$T/job.env"
eq "c'e' un job dello schema" "0" "$NESSUN_JOB"
if [ "$NESSUN_JOB" = 0 ]; then
  eq "gira prima del backend negli upgrade" "1" "$(echo "$JOB_HOOK" | grep -q pre-upgrade && echo 1 || echo 0)"
  nuovo_db l
  sql_file l "$T/init-main.sql"; semina_utenti l; PRIMA=$(impronta_dati l)
  args=(); for m in $JOB_MOUNTS; do args+=(-v "$m"); done
  for e in $JOB_ENV; do args+=(-e "$e"); done
  eval "cmd=($JOB_CMD)"
  # immagine del job: -alpine va bene uguale (bash e psql ci sono)
  docker run --rm --network "$NET" "${args[@]}" -e PGHOST="$PFX-l" -e DB_HOST="$PFX-l" \
    -e PGPASSWORD=pw -e DB_PASSWORD=pw -e PGUSER=postgres -e PGDATABASE=prima_nota \
    "$JOB_IMAGE" "${cmd[@]}" > "$T/out" 2>&1
  eq "job exit 0" "0" "$?"
  eq "database di main portato alla $ULTIMA" "$ULTIMA" "$(q l "SELECT max(versione) FROM schema_migrazioni" 2>/dev/null)"
  eq "tabella dell'ultima migrazione presente (token_account)" "token_account" "$(q l "SELECT to_regclass('public.token_account')")"
  eq "utenti intatti" "$PRIMA" "$(impronta_dati l)"
fi

echo "=== M. docker-compose: servizio di migrazione ==="
docker compose config --format json > "$T/compose.json" 2>/dev/null
eq "compose config" "0" "$?"
python3 - "$T/compose.json" > "$T/compose.env" <<'PY'
import sys, json, shlex
q = shlex.quote
s = json.load(open(sys.argv[1]))['services']
m = s.get('migra')
dep = (s.get('backend', {}).get('depends_on') or {}).get('migra', {}).get('condition', '')
initdb = [v for v in s['db'].get('volumes', []) if 'docker-entrypoint-initdb.d' in (v.get('target') or '')]
print(f'C_MIGRA={1 if m else 0}')
print(f'C_DEP={dep}')
print(f'C_INITDB={len(initdb)}')
if m:
    print('C_IMAGE=' + q(m['image']))
    print('C_CMD=' + q(' '.join(q(x) for x in m['command'])))
    print('C_VOL=' + q(' '.join(f"{v['source']}:{v['target']}:ro" for v in m.get('volumes', []))))
PY
C_MIGRA=0; C_DEP=; C_INITDB=0; . "$T/compose.env"
eq "c'e' il servizio migra" "1" "$C_MIGRA"
eq "il backend aspetta che finisca bene" "service_completed_successfully" "$C_DEP"
eq "il db non esegue piu' script initdb (un solo percorso)" "0" "$C_INITDB"
if [ "$C_MIGRA" = 1 ]; then
  nuovo_db m
  sql_file m "$T/init-main.sql"; semina_utenti m; PRIMA=$(impronta_dati m)
  args=(); for v in $C_VOL; do args+=(-v "$v"); done
  eval "ccmd=($C_CMD)"
  docker run --rm --network "$NET" "${args[@]}" -e PGHOST="$PFX-m" -e PGUSER=postgres -e PGPASSWORD=pw -e PGDATABASE=prima_nota \
    "$C_IMAGE" "${ccmd[@]}" > "$T/out" 2>&1
  eq "servizio exit 0" "0" "$?"
  eq "database di main portato alla $ULTIMA" "$ULTIMA" "$(q m "SELECT max(versione) FROM schema_migrazioni")"
  eq "utenti intatti" "$PRIMA" "$(impronta_dati m)"
fi

echo "=== N. copia dei file nel chart ==="
if [ -x scripts/sincronizza-helm-db.sh ]; then
  scripts/sincronizza-helm-db.sh --verifica > "$T/out" 2>&1
  eq "helm-chart/files/database allineato" "0" "$?"
else
  ko "helm-chart/files/database allineato" "scripts/sincronizza-helm-db.sh" "assente"
fi

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
