#!/usr/bin/env bash
# ==============================================================================
# migra.sh — applica lo schema e le migrazioni mancanti, e le registra.
# ==============================================================================
# Un solo percorso per tutti gli ambienti (docker-compose, job Helm, a mano):
#
#   database vuoto       -> init.sql (versione 000) e poi 001, 002, ... in ordine;
#   database gia' usato  -> solo le migrazioni non ancora registrate;
#   database anteriore a questo script (nessuna `schema_migrazioni`, ma `utenti`
#   c'e')                -> si riconosce fin dove era arrivato guardando lo schema
#                           (impronte 000..008), si registra come 'rilevata' senza
#                           eseguire nulla, e si prosegue da li'.
#
# Regole:
#   * ogni migrazione gira in UNA transazione insieme alla riga che la registra:
#     o c'e' tutta e registrata, o non c'e' affatto. I BEGIN;/COMMIT; del file si
#     tolgono (ne e' ammesso al piu' uno per tipo, su riga propria);
#   * un advisory lock serializza due esecuzioni concorrenti (due pod del job, due
#     `compose up`): la seconda aspetta e trova gia' tutto registrato;
#   * init.sql comincia con DROP TABLE ... CASCADE: si esegue solo se `utenti` non
#     esiste, controllato dentro la stessa transazione;
#   * una migrazione registrata non si modifica: se il file non ha piu' lo stesso
#     SHA-256 lo script si ferma. Una correzione e' una migrazione nuova;
#   * se il database ha migrazioni che questi file non conoscono (codice piu'
#     vecchio dello schema) lo script si ferma.
#
# Uso (connessione dalle variabili PG* o DB_* del backend):
#   database/migra.sh [applica]        applica le mancanti (default)
#   database/migra.sh stato            elenca applicate e mancanti, non cambia nulla
#   database/migra.sh annulla <NNN>    esegue NNN_*_down.sql, solo se NNN e' l'ultima
#
# Attesa del database: MIGRA_ATTESA_SEC (default 120).
# Cartella dei file: MIGRA_DIR (default: la cartella di questo script), con
# init.sql e migrations/NNN_nome.sql.
# Esce diverso da 0 al primo errore; quello che era gia' registrato resta.
# ==============================================================================

set -euo pipefail

DIR="${MIGRA_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
export PGHOST="${PGHOST:-${DB_HOST:-localhost}}"
export PGPORT="${PGPORT:-${DB_PORT:-5432}}"
export PGDATABASE="${PGDATABASE:-${DB_NAME:-prima_nota}}"
export PGUSER="${PGUSER:-${DB_USER:-postgres}}"
[ -n "${PGPASSWORD:-}" ] || [ -z "${DB_PASSWORD:-}" ] || export PGPASSWORD="$DB_PASSWORD"
# I NOTICE delle migrazioni ("does not exist, skipping") sono rumore: solo avvisi ed errori.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
ATTESA_SEC="${MIGRA_ATTESA_SEC:-120}"   # quanto aspettare che PostgreSQL risponda

LOCK=727001500          # chiave dell'advisory lock, fissa
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log()  { printf 'migra: %s\n' "$*"; }
muori() { printf 'migra: ERRORE: %s\n' "$*" >&2; exit 1; }
psql_() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
val()   { psql -X -tA -v ON_ERROR_STOP=1 -c "$1"; }
# Esegue uno script; dello stdout (le SELECT di verifica di init.sql) tiene solo
# i messaggi di questo script. Gli errori di psql vanno su stderr cosi' come sono.
esegui() { psql_ -f "$1" > "$TMP/out" || return 1; grep '^migra: ' "$TMP/out" || true; }
sha()   { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64; }

# ------------------------------------------------------------------------------
# Elenco delle migrazioni: "versione|nome|file", in ordine. 000 = init.sql.
# ------------------------------------------------------------------------------
elenco() {
  [ -f "$DIR/init.sql" ] || muori "manca $DIR/init.sql"
  echo "000|init|$DIR/init.sql"
  local f b
  for f in "$DIR"/migrations/[0-9][0-9][0-9]_*.sql; do
    [ -e "$f" ] || continue
    b=$(basename "$f" .sql)
    case "$b" in *_down) continue ;; esac
    echo "${b:0:3}|${b:4}|$f"
  done
}

# Controlla che le versioni siano uniche (due file 009_ sarebbero un conflitto di
# merge, non un ordine).
controlla_elenco() {
  local dup
  dup=$(elenco | cut -d'|' -f1 | sort | uniq -d)
  [ -z "$dup" ] || muori "versioni duplicate nella cartella: $dup"
}

# Corpo del file senza i BEGIN;/COMMIT; di primo livello (li mette lo script) e
# senza i \c (init.sql si collega da solo a prima_nota: qui decide PGDATABASE).
corpo() {
  local f="$1" out="$2" b c
  b=$(grep -cE '^[[:space:]]*BEGIN;[[:space:]]*$' "$f" || true)
  c=$(grep -cE '^[[:space:]]*COMMIT;[[:space:]]*$' "$f" || true)
  [ "$b" -le 1 ] && [ "$c" -le 1 ] && [ "$b" = "$c" ] \
    || muori "$(basename "$f"): attesi al piu' un BEGIN; e un COMMIT; su riga propria (trovati $b e $c)"
  grep -vE '^[[:space:]]*(BEGIN;|COMMIT;)[[:space:]]*$|^[[:space:]]*\\c[[:space:]]' "$f" > "$out" || true
}

# Letterale SQL sicuro per nomi e checksum (solo [A-Za-z0-9_]).
lett() { [[ "$1" =~ ^[A-Za-z0-9_]+$ ]] || muori "nome non ammesso: $1"; printf "'%s'" "$1"; }

# ------------------------------------------------------------------------------
# Impronte per i database anteriori a migra.sh. Congelate: le migrazioni dalla
# 009 in poi girano solo su database che hanno gia' `schema_migrazioni`.
# Ognuna e' un oggetto che solo quella migrazione crea (002..008 sono
# transazionali: se c'e' quello, c'e' tutta; la 001 non lo era, si guarda la
# tabella dei messaggi, che e' l'ultima creata).
# ------------------------------------------------------------------------------
impronta() {
  case "$1" in
    000) echo "to_regclass('public.utenti') IS NOT NULL" ;;
    001) echo "to_regclass('public.messaggi_commercialista') IS NOT NULL" ;;
    002) echo "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collegamenti_commercialista' AND column_name='stato')" ;;
    003) echo "to_regclass('public.idx_token_stato') IS NOT NULL" ;;
    # la 003 crea gia' richiedi_collegamento_interno: la 004 la riscrive con i tentativi
    004) echo "EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='richiedi_collegamento_interno' AND p.prosrc LIKE '%v_tentativi%')" ;;
    005) echo "EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='registra_accessi_elenco')" ;;
    006) echo "EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='accoda_promemoria_non_letti')" ;;
    007) echo "EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accessi_commercialista_tipo_accesso_check' AND pg_get_constraintdef(oid) LIKE '%allegato%')" ;;
    008) echo "to_regclass('public.uq_commercialisti_email_lower') IS NOT NULL" ;;
    *)   echo "" ;;
  esac
}

# ------------------------------------------------------------------------------
# Avvio: tabella di registro e, se serve, riconoscimento del database esistente.
# Tutto sotto lock, in una transazione.
# ------------------------------------------------------------------------------
avvio() {
  local s="$TMP/avvio.sql" v n f p righe=""
  while IFS='|' read -r v n f; do
    p=$(impronta "$v"); [ -n "$p" ] || continue
    righe="${righe}${righe:+ UNION ALL }SELECT $(lett "$v") AS versione, $(lett "$n") AS nome, $(lett "$(sha "$f")") AS checksum, ($p) AS presente"
  done < <(elenco)

  cat > "$s" <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($LOCK) AS lock_preso \gset
SELECT to_regclass('public.schema_migrazioni') IS NULL AS nuova,
       to_regclass('public.utenti') IS NOT NULL AS popolato \gset
\if :nuova
CREATE TABLE schema_migrazioni (
    versione     CHAR(3) PRIMARY KEY CHECK (versione ~ '^[0-9]{3}\$'),
    nome         VARCHAR(100) NOT NULL,
    checksum     CHAR(64) NOT NULL,
    origine      VARCHAR(10) NOT NULL CHECK (origine IN ('eseguita', 'rilevata')),
    applicata_il TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
\if :popolato
CREATE TEMP TABLE impronte ON COMMIT DROP AS $righe;
-- Le impronte devono essere un prefisso: 000..k presenti, il resto assente.
-- Un buco vuol dire uno schema toccato a mano: meglio fermarsi che indovinare.
DO \$\$
DECLARE k INTEGER; n INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE presente), coalesce(max(versione::int) FILTER (WHERE presente), -1)
    INTO n, k FROM impronte;
  IF n <> k + 1 THEN
    RAISE EXCEPTION 'schema non riconoscibile: impronte presenti %, ma non in sequenza da 000', n;
  END IF;
END
\$\$;
INSERT INTO schema_migrazioni (versione, nome, checksum, origine)
  SELECT versione, nome, checksum, 'rilevata' FROM impronte WHERE presente ORDER BY versione;
SELECT coalesce(string_agg(versione, ' ' ORDER BY versione), '-') AS rilevate FROM impronte WHERE presente \gset
\echo 'migra: database esistente senza registro: rilevate' :rilevate
\endif
\endif
COMMIT;
SQL
  psql_ -f "$s"
}

# ------------------------------------------------------------------------------
# Coerenza fra registro e file.
# ------------------------------------------------------------------------------
controlla_registro() {
  local reg v n f cs noti="" ignote=""
  reg=$(val "SELECT versione||'|'||checksum FROM schema_migrazioni ORDER BY versione")
  while IFS='|' read -r v n f; do
    noti="$noti $v"
    cs=$(printf '%s\n' "$reg" | awk -F'|' -v v="$v" '$1==v{print $2}')
    if [ -n "$cs" ] && [ "$cs" != "$(sha "$f")" ]; then
      muori "la migrazione $v ($n) e' gia' applicata ma il file e' cambiato. Non si modifica una migrazione applicata: scriverne una nuova."
    fi
  done < <(elenco)
  for v in $(printf '%s\n' "$reg" | cut -d'|' -f1); do
    case " $noti " in *" $v "*) ;; *) ignote="$ignote $v" ;; esac
  done
  [ -z "$ignote" ] || muori "il database ha migrazioni che questi file non conoscono:$ignote (codice piu' vecchio dello schema?)"
}

# ------------------------------------------------------------------------------
# Una migrazione: lock, ricontrollo, corpo, registrazione, in una transazione.
# ------------------------------------------------------------------------------
applica_una() {
  local v="$1" n="$2" f="$3" s="$TMP/m$1.sql" c="$TMP/c$1.sql" guardia=""
  corpo "$f" "$c"
  if [ "$v" = 000 ]; then
    guardia="DO \$\$ BEGIN IF to_regclass('public.utenti') IS NOT NULL THEN
  RAISE EXCEPTION 'init.sql su un database che ha gia'' utenti: rifiutato (cancellerebbe i dati)';
END IF; END \$\$;"
  fi
  cat > "$s" <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($LOCK) AS lock_preso \gset
SELECT EXISTS (SELECT 1 FROM schema_migrazioni WHERE versione = $(lett "$v")) AS gia \gset
\if :gia
ROLLBACK;
\echo 'migra: $v gia'' applicata (da un''altra esecuzione)'
\else
$guardia
\i $c
INSERT INTO schema_migrazioni (versione, nome, checksum, origine)
  VALUES ($(lett "$v"), $(lett "$n"), $(lett "$(sha "$f")"), 'eseguita');
COMMIT;
\echo 'migra: $v $n applicata'
\endif
SQL
  esegui "$s" || muori "$v ($n) fallita: nessuna modifica di questa migrazione e' rimasta"
}

attendi_db() {
  local i
  for i in $(seq 1 $(( (ATTESA_SEC + 1) / 2 ))); do
    pg_isready -q && return 0
    [ "$i" = 1 ] && log "attendo PostgreSQL su $PGHOST:$PGPORT (al piu' ${ATTESA_SEC}s)"
    sleep 2
  done
  muori "PostgreSQL non risponde su $PGHOST:$PGPORT"
}

applica() {
  attendi_db
  controlla_elenco
  avvio
  controlla_registro
  local v n f fatte=0
  local reg; reg=" $(val "SELECT string_agg(versione, ' ') FROM schema_migrazioni") "
  while IFS='|' read -r v n f; do
    case "$reg" in *" $v "*) continue ;; esac
    applica_una "$v" "$n" "$f"
    fatte=$((fatte + 1))
  done < <(elenco)
  log "schema aggiornato alla $(val "SELECT max(versione) FROM schema_migrazioni") ($fatte applicate ora)"
}

stato() {
  attendi_db
  controlla_elenco
  if [ "$(val "SELECT to_regclass('public.schema_migrazioni') IS NULL")" = t ]; then
    log "nessun registro: al primo 'applica' il database verra' riconosciuto o inizializzato"
    return 0
  fi
  local v n f r
  while IFS='|' read -r v n f; do
    r=$(val "SELECT origine||' '||to_char(applicata_il,'YYYY-MM-DD HH24:MI') FROM schema_migrazioni WHERE versione='$v'")
    printf '  %s %-28s %s\n' "$v" "$n" "${r:-MANCANTE}"
  done < <(elenco)
  controlla_registro
}

# Rollback dell'ultima migrazione, con il suo _down.sql, in una transazione con
# la cancellazione della riga di registro.
annulla() {
  local v="${1:-}" f d s c
  [[ "$v" =~ ^[0-9]{3}$ ]] && [ "$v" != 000 ] || muori "uso: migra.sh annulla <NNN> (NNN > 000)"
  attendi_db
  [ "$(val "SELECT max(versione) FROM schema_migrazioni")" = "$v" ] || muori "$v non e' l'ultima migrazione applicata"
  f=$(elenco | awk -F'|' -v v="$v" '$1==v{print $3}')
  d="${f%.sql}_down.sql"
  [ -f "$d" ] || muori "manca $(basename "$d")"
  c="$TMP/d$v.sql"; s="$TMP/a$v.sql"
  corpo "$d" "$c"
  cat > "$s" <<SQL
BEGIN;
SELECT pg_advisory_xact_lock($LOCK) AS lock_preso \gset
SELECT max(versione) = $(lett "$v") AS ultima FROM schema_migrazioni \gset
\if :ultima
\i $c
DELETE FROM schema_migrazioni WHERE versione = $(lett "$v");
COMMIT;
\echo 'migra: $v annullata'
\else
ROLLBACK;
\echo 'migra: $v non e'' piu'' l''ultima: niente da fare'
\endif
SQL
  esegui "$s" || muori "annullamento di $v fallito: nessuna modifica"
}

case "${1:-applica}" in
  applica) applica ;;
  stato)   stato ;;
  annulla) annulla "${2:-}" ;;
  *) muori "comando sconosciuto: $1 (applica | stato | annulla <NNN>)" ;;
esac
