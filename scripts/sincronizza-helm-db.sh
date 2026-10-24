#!/usr/bin/env bash
# Copia lo schema e le migrazioni nel chart Helm (helm-chart/files/database/) e il
# modello della configurazione nginx del frontend web/ (helm-chart/files/nginx/).
# Un chart non puo' leggere file fuori dalla sua cartella: la copia e' l'unico
# modo di avere nel job gli stessi file di docker-compose. La fonte resta
# database/; la copia non si modifica a mano.
#
#   scripts/sincronizza-helm-db.sh           copia
#   scripts/sincronizza-helm-db.sh --verifica esce 1 se la copia non e' allineata
set -euo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$R/database"; DST="$R/helm-chart/files/database"
NGX="$R/web/nginx/default.conf.template"
elenco() { (cd "$1" && ls init.sql migra.sh migrations/[0-9][0-9][0-9]_*.sql 2>/dev/null); }
if [ "${1:-}" = --verifica ]; then
  diff <(elenco "$SRC") <(elenco "$DST") >/dev/null || { echo "helm-chart/files/database: elenco dei file diverso da database/"; exit 1; }
  for f in $(elenco "$SRC"); do cmp -s "$SRC/$f" "$DST/$f" || { echo "helm-chart/files/database/$f diverso da database/$f"; exit 1; }; done
  cmp -s "$NGX" "$R/helm-chart/files/nginx/default.conf.template" || { echo "helm-chart/files/nginx/default.conf.template diverso da web/nginx/"; exit 1; }
  echo "helm-chart/files/database allineato a database/ ($(elenco "$SRC" | wc -l | tr -d ' ') file), nginx allineato"
  exit 0
fi
rm -rf "$DST"; mkdir -p "$DST/migrations"
for f in $(elenco "$SRC"); do cp "$SRC/$f" "$DST/$f"; done
echo "copiati $(elenco "$DST" | wc -l | tr -d ' ') file in helm-chart/files/database"
mkdir -p "$R/helm-chart/files/nginx"; cp "$NGX" "$R/helm-chart/files/nginx/default.conf.template"
echo "copiato il modello nginx in helm-chart/files/nginx"
