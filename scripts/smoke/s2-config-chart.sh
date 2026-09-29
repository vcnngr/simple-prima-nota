#!/usr/bin/env bash
# Smoke test della configurazione del backend nel chart Helm (blocco S2).
#
# Due parti:
#   1. render (`helm template`) nelle varianti che contano:
#      A. le tre modalita' di database;
#      B. FRONTEND_URL pubblico: da app.publicUrl o dall'ingress, mai l'indirizzo
#         interno del servizio; senza nessuno dei due il render si ferma;
#      C. i numeri dei values arrivano interi (10485760, non "1.048576e+07");
#      D. SMTP: host e porta dai values, password solo da Secret;
#      E. allegati: PVC (tenuto dopo uninstall), mount, fsGroup, Recreate con
#         ReadWriteOnce; piu' repliche solo con ReadWriteMany;
#   2. esecuzione (F): l'immagine del backend di questo checkout parte con
#      l'ambiente e i volumi del Deployment renderizzato (valori dei Secret
#      sostituiti, PVC simulato come lo prepara kubelet: radice root:root 755,
#      poi gruppo fsGroup con setgid; fsGroup aggiunto ai gruppi del processo):
#      la mail di reset arriva con il link pubblico, un allegato si carica e si
#      riscarica dopo che il pod e' stato sostituito.
#
#   ./scripts/smoke/s2-config-chart.sh     (dal repo; servono docker e helm)
#   S2_EXTRA_SET="--set ..." aggiunge values al render della parte F (controprove).
#
# Esce 1 se anche un solo caso fallisce.

set -u
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$R"
PFX="pn-s2-$$"
NET="$PFX-net"
IMG_PG=docker.io/library/postgres:16.1
IMG_BE="pn-s2-backend:$$"
T=$(mktemp -d)
CH=helm-chart

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf '  OK    %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n         atteso=%s ottenuto=%s\n' "$1" "$2" "$3"; }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$2" "$3"; fi; }
j()  { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null || echo "-"; }

pulizia() {
  docker ps -aq --filter "name=^$PFX-" | xargs -r docker rm -f >/dev/null 2>&1
  docker volume rm "$PFX-pvc" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  docker rmi "$IMG_BE" >/dev/null 2>&1
  rm -rf "$T"
}
trap pulizia EXIT

# render <file> [helm args...] -> codice in $RC, errori in <file>.err
render() { local f="$1"; shift; helm template t "$CH" "$@" > "$f" 2> "$f.err"; RC=$?; }
# Valore di una variabile del container backend nel render: "-" se assente,
# "secret:<nome>/<chiave>" se viene da un Secret.
envb() {
  uv run -q --with pyyaml python - "$1" "$2" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
dep = [d for d in docs if d['kind'] == 'Deployment' and d['metadata']['name'].endswith('-backend')][0]
for e in dep['spec']['template']['spec']['containers'][0].get('env', []):
    if e['name'] == sys.argv[2]:
        if 'value' in e: print(e['value'])
        else:
            r = e['valueFrom']['secretKeyRef']; print(f"secret:{r['name']}/{r['key']}")
        break
else:
    print('-')
PY
}
# Espressione python sul Deployment del backend (dep) e su tutti i documenti (docs).
dep() {
  uv run -q --with pyyaml python - "$1" "$2" <<'PY'
import sys, yaml
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
dep = [d for d in docs if d['kind'] == 'Deployment' and d['metadata']['name'].endswith('-backend')][0]
spec = dep['spec']['template']['spec']; c = spec['containers'][0]
print(eval(sys.argv[2]))
PY
}

echo "=== A. render nelle tre modalita' di database ==="
helm lint "$CH" > "$T/lint" 2>&1; eq "helm lint" "0" "$?"
for modo in "" "--set cloudnativepg.enabled=false --set postgresql.enabled=true" \
            "--set cloudnativepg.enabled=false --set externalDatabase.enabled=true --set externalDatabase.host=x"; do
  render "$T/m.yaml" $modo
  eq "helm template ${modo:-(default)}" "0" "$RC"
  eq "  FRONTEND_URL pubblico" "https://prima-nota.example.com" "$(envb "$T/m.yaml" FRONTEND_URL)"
done

echo "=== B. FRONTEND_URL ==="
render "$T/b.yaml"
eq "default: https + primo host dell'ingress (host in tls)" "https://prima-nota.example.com" "$(envb "$T/b.yaml" FRONTEND_URL)"
eq "non e' l'indirizzo interno del servizio" "0" "$(grep -c 'value: "http://t-simple-prima-nota-frontend' "$T/b.yaml")"
render "$T/b.yaml" --set 'ingress.tls=null'
eq "host senza tls -> http" "http://prima-nota.example.com" "$(envb "$T/b.yaml" FRONTEND_URL)"
render "$T/b.yaml" --set app.publicUrl=https://conti.studio.it/pn/
eq "app.publicUrl vince, senza / finale" "https://conti.studio.it/pn" "$(envb "$T/b.yaml" FRONTEND_URL)"
render "$T/b.yaml" --set ingress.enabled=false
eq "senza ingress e senza app.publicUrl -> render rifiutato" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
eq "  dice cosa manca" "1" "$(grep -c 'app.publicUrl e.* obbligatorio senza ingress' "$T/b.yaml.err")"
render "$T/b.yaml" --set ingress.enabled=false --set app.publicUrl=https://pn.example.it
eq "senza ingress, con app.publicUrl" "0|https://pn.example.it" "$RC|$(envb "$T/b.yaml" FRONTEND_URL)"
render "$T/b.yaml" --set app.publicUrl=pn.example.it
eq "app.publicUrl senza schema -> rifiutato" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"

echo "=== C. numeri interi ==="
render "$T/c.yaml"
eq "nessun valore in notazione esponenziale" "0" "$(grep -cE 'value: "?[0-9.]+e[+-][0-9]+' "$T/c.yaml")"
eq "MAX_FILE_SIZE" "10485760" "$(envb "$T/c.yaml" MAX_FILE_SIZE)"
eq "ALLEGATI_QUOTA_BYTES" "209715200" "$(envb "$T/c.yaml" ALLEGATI_QUOTA_BYTES)"
render "$T/c.yaml" --set backend.env.ALLEGATI_MAX_BYTES=52428800
eq "anche da --set" "52428800" "$(envb "$T/c.yaml" ALLEGATI_MAX_BYTES)"

echo "=== D. SMTP ==="
render "$T/d.yaml"
eq "senza SMTP_HOST: variabile non passata" "-" "$(envb "$T/d.yaml" SMTP_HOST)"
eq "senza password: niente SMTP_PASS" "-" "$(envb "$T/d.yaml" SMTP_PASS)"
eq "MAIL_FROM" "Simple Prima Nota <no-reply@example.com>" "$(envb "$T/d.yaml" MAIL_FROM)"
render "$T/d.yaml" --set backend.env.SMTP_HOST=smtp.example.it --set backend.env.SMTP_USER=pn \
  --set backend.smtpPassword.value=Segreto-S2-Smtp
eq "SMTP_HOST" "smtp.example.it" "$(envb "$T/d.yaml" SMTP_HOST)"
eq "SMTP_PASS dal Secret del chart" "secret:t-simple-prima-nota-secret/smtp-password" "$(envb "$T/d.yaml" SMTP_PASS)"
eq "il Secret ha la password" "Segreto-S2-Smtp" \
  "$(dep "$T/d.yaml" "__import__('base64').b64decode([d for d in docs if d['kind']=='Secret' and d['metadata']['name']=='t-simple-prima-nota-secret'][0]['data']['smtp-password']).decode()")"
eq "la password in chiaro non compare nel render" "0" "$(grep -c 'Segreto-S2-Smtp' "$T/d.yaml")"
render "$T/d.yaml" --set backend.smtpPassword.existingSecret=posta --set backend.smtpPassword.key=pass
eq "existingSecret" "secret:posta/pass" "$(envb "$T/d.yaml" SMTP_PASS)"
eq "  il Secret del chart non ha smtp-password" "False" \
  "$(dep "$T/d.yaml" "'smtp-password' in [d for d in docs if d['kind']=='Secret' and d['metadata']['name']=='t-simple-prima-nota-secret'][0]['data']")"

echo "=== E. allegati ==="
render "$T/e.yaml"
eq "ALLEGATI_DIR" "/app/uploads/allegati" "$(envb "$T/e.yaml" ALLEGATI_DIR)"
eq "volume montato su ALLEGATI_DIR" "/app/uploads/allegati" "$(dep "$T/e.yaml" "[m['mountPath'] for m in c.get('volumeMounts',[]) if m['name']=='allegati'][0]")"
eq "dal PVC del chart" "t-simple-prima-nota-allegati" "$(dep "$T/e.yaml" "[v for v in spec['volumes'] if v['name']=='allegati'][0]['persistentVolumeClaim']['claimName']")"
eq "il PVC esiste e resta dopo uninstall" "ReadWriteOnce|10Gi|keep" \
  "$(dep "$T/e.yaml" "(lambda p: p['spec']['accessModes'][0]+'|'+p['spec']['resources']['requests']['storage']+'|'+p['metadata']['annotations']['helm.sh/resource-policy'])([d for d in docs if d['kind']=='PersistentVolumeClaim' and d['metadata']['name']=='t-simple-prima-nota-allegati'][0])")"
eq "fsGroup del gruppo nodejs (1001)" "1001" "$(dep "$T/e.yaml" "spec.get('securityContext',{}).get('fsGroup')")"
eq "ReadWriteOnce -> strategia Recreate" "Recreate" "$(dep "$T/e.yaml" "dep['spec'].get('strategy',{}).get('type')")"
render "$T/e.yaml" --set backend.replicaCount=2
eq "due repliche con ReadWriteOnce -> rifiutato" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"
eq "  dice perche'" "1" "$(grep -c 'ReadWriteMany' "$T/e.yaml.err")"
render "$T/e.yaml" --set backend.replicaCount=2 --set 'backend.allegati.persistence.accessModes={ReadWriteMany}'
eq "due repliche con ReadWriteMany: ok, niente Recreate" "0|None" "$RC|$(dep "$T/e.yaml" "dep['spec'].get('strategy',{}).get('type')")"
render "$T/e.yaml" --set backend.allegati.persistence.existingClaim=miei-allegati
eq "existingClaim: usato, nessun PVC creato" "miei-allegati|0" \
  "$(dep "$T/e.yaml" "[v for v in spec['volumes'] if v['name']=='allegati'][0]['persistentVolumeClaim']['claimName']")|$(grep -c 'name: t-simple-prima-nota-allegati' "$T/e.yaml")"
render "$T/e.yaml" --set backend.allegati.persistence.enabled=false
eq "senza persistenza: emptyDir, nessun PVC" "True|0" \
  "$(dep "$T/e.yaml" "'emptyDir' in [v for v in spec['volumes'] if v['name']=='allegati'][0]")|$(grep -c 'name: t-simple-prima-nota-allegati' "$T/e.yaml")"
render "$T/e.yaml" --set backend.allegati.persistence.enabled=false --set backend.replicaCount=2
eq "senza persistenza e due repliche -> rifiutato" "1" "$([ "$RC" != 0 ] && echo 1 || echo 0)"

echo "=== F. il backend parte con l'ambiente e i volumi renderizzati ==="
docker network create "$NET" >/dev/null
docker build -q -t "$IMG_BE" backend > "$T/build" 2>&1; eq "immagine del backend costruita" "0" "$?"
docker run -d --name "$PFX-db" --network "$NET" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=prima_nota "$IMG_PG" >/dev/null
docker run -d --name "$PFX-mail" --network "$NET" -p 127.0.0.1::8025 docker.io/axllent/mailpit >/dev/null
for i in $(seq 1 60); do docker exec "$PFX-db" psql -U postgres -d prima_nota -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
docker run --rm --network "$NET" -e PGHOST="$PFX-db" -e PGUSER=postgres -e PGPASSWORD=pw -e PGDATABASE=prima_nota \
  -v "$R/database:/database:ro" "$IMG_PG" bash /database/migra.sh > "$T/migra" 2>&1
eq "schema applicato (migra.sh)" "0" "$?"
MAIL_API="http://$(docker port "$PFX-mail" 8025 | head -1)"

render "$T/f.yaml" --set backend.env.SMTP_HOST="$PFX-mail" --set backend.env.SMTP_PORT=1025 \
  --set backend.env.NODE_ENV=production ${S2_EXTRA_SET:-}
# Dal Deployment: env letterali, riferimenti ai Secret, mount, fsGroup.
uv run -q --with pyyaml python - "$T/f.yaml" "$T" <<'PY' > "$T/pod.env"
import sys, yaml, shlex
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
dep = [d for d in docs if d['kind'] == 'Deployment' and d['metadata']['name'].endswith('-backend')][0]
spec = dep['spec']['template']['spec']; c = spec['containers'][0]
segreti = {'postgres-password': 'pw', 'jwt-secret': 'segreto-jwt-s2', 'smtp-password': 'x'}
with open(sys.argv[2] + '/be.env', 'w') as f:
    for e in c.get('env', []):
        v = e['value'] if 'value' in e else segreti[e['valueFrom']['secretKeyRef']['key']]
        f.write(f"{e['name']}={v}\n")
vols = {v['name']: v for v in spec.get('volumes', [])}
mounts = [m['mountPath'] for m in c.get('volumeMounts', []) if 'persistentVolumeClaim' in vols[m['name']]]
print('POD_MOUNTS=' + shlex.quote(' '.join(mounts)))
print('POD_FSGROUP=' + shlex.quote(str(spec.get('securityContext', {}).get('fsGroup', ''))))
PY
POD_MOUNTS=""; POD_FSGROUP=""; . "$T/pod.env"
eq "il Deployment monta un PVC" "1" "$([ -n "$POD_MOUNTS" ] && echo 1 || echo 0)"

# PVC nuovo come lo trova kubelet (root:root 755); poi fsGroup: gruppo e setgid.
docker volume create "$PFX-pvc" >/dev/null
docker run --rm -v "$PFX-pvc:/pvc" alpine sh -c "chown 0:0 /pvc && chmod 755 /pvc" >/dev/null 2>&1
[ -n "$POD_FSGROUP" ] && docker run --rm -v "$PFX-pvc:/pvc" alpine sh -c "chgrp $POD_FSGROUP /pvc && chmod 2775 /pvc" >/dev/null 2>&1

avvia_pod() {  # un "pod" del backend; stesso volume a ogni avvio
  docker rm -f "$PFX-be" >/dev/null 2>&1
  local args=() m
  for m in $POD_MOUNTS; do args+=(--mount "type=volume,src=$PFX-pvc,dst=$m,volume-nocopy"); done
  [ -n "$POD_FSGROUP" ] && args+=(--group-add "$POD_FSGROUP")
  docker run -d --name "$PFX-be" --network "$NET" -p 127.0.0.1::3001 --env-file "$T/be.env" \
    -e DB_HOST="$PFX-db" "${args[@]}" "$IMG_BE" >/dev/null
  API="http://$(docker port "$PFX-be" 3001 | head -1)/api"
  local i; for i in $(seq 1 60); do curl -s --max-time 1 "$API/health" >/dev/null && return 0; sleep 1; done
  docker logs "$PFX-be" 2>&1 | tail -5 | sed 's/^/         | /'; return 1
}
avvia_pod; eq "il backend risponde" "0" "$?"
JSON=(-H "Content-Type: application/json")
SFX="s2$$"
reg_u() { curl -s -X POST "$API/auth/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\"}" | j "['token']"; }
reg_c() { curl -s -X POST "$API/commercialisti/register" "${JSON[@]}" -d "{\"username\":\"$1\",\"email\":\"$1@t.it\",\"password\":\"Password123!\",\"ragione_sociale\":\"Studio S2\"}" | j "['token']"; }

# Reset password: la mail parte (SMTP dai values) e il link e' pubblico.
U="s2u$SFX"; UT=$(reg_u "$U")
curl -s -o /dev/null -X POST "$API/auth/password-dimenticata" "${JSON[@]}" -d "{\"identificativo\":\"$U\"}"
LINK=""
for i in $(seq 1 20); do
  LINK=$(curl -s "$MAIL_API/api/v1/messages?limit=50" | python3 -c "
import sys,json,urllib.request
d=json.load(sys.stdin)
ms=[m for m in d.get('messages',[]) if any(a['Address']=='$U@t.it' for a in m.get('To',[]))]
if ms:
  t=json.load(urllib.request.urlopen('$MAIL_API/api/v1/message/'+ms[0]['ID']))['Text']
  import re; m=re.search(r'(https?://\S+)#token=', t); print(m.group(1) if m else '')" 2>/dev/null)
  [ -n "$LINK" ] && break; sleep 0.5
done
eq "mail di reset consegnata, link pubblico" "https://prima-nota.example.com/reimposta-password" "$LINK"

# Allegato: collegamento attivo, upload, file sul volume, download dopo un pod nuovo.
C="s2c$SFX"; CT=$(reg_c "$C")
curl -s -o /dev/null -X POST "$API/commercialisti/richieste" -H "Authorization: Bearer $CT" "${JSON[@]}" -d "{\"identificativo_cliente\":\"$U\"}"
COLL=$(curl -s "$API/utenti/collegamenti" -H "Authorization: Bearer $UT" | j "['collegamenti'][0]['id']")
curl -s -o /dev/null -X PUT "$API/utenti/collegamenti/$COLL/accetta" -H "Authorization: Bearer $UT" "${JSON[@]}" -d '{}'
{ printf '%%PDF-1.4\n%% S2-%s\n' "$SFX"; head -c 204800 /dev/urandom | base64; printf '\n%%%%EOF\n'; } > "$T/doc.pdf"
CODE=$(curl -s -o "$T/up" -w '%{http_code}' -X POST "$API/messaggi/allegati?collegamentoId=$COLL" \
  -H "Authorization: Bearer $UT" -F "file=@$T/doc.pdf;filename=doc.pdf" -F "messaggio=S2")
eq "allegato da 270 KB caricato" "201" "$CODE$( [ "$CODE" = 201 ] || echo " $(head -c 150 "$T/up")")"
AID=$(j "['messaggio']['allegati'][0]['id']" < "$T/up")
eq "il file e' sul volume" "1" "$(docker run --rm -v "$PFX-pvc:/pvc" alpine sh -c 'find /pvc -type f | wc -l' 2>/dev/null | tr -d ' ')"
avvia_pod; eq "pod sostituito, il backend risponde" "0" "$?"
CODE=$(curl -s -o "$T/down.pdf" -w '%{http_code}' "$API/messaggi/allegati/$AID?collegamentoId=$COLL" -H "Authorization: Bearer $UT")
eq "dopo la sostituzione l'allegato si scarica identico" "200|$(shasum -a 256 < "$T/doc.pdf" | cut -c1-64)" \
  "$CODE|$(shasum -a 256 < "$T/down.pdf" | cut -c1-64)"

echo
echo "================================================"
echo "PASS $PASS   FAIL $FAIL"
[ "$FAIL" -eq 0 ]
