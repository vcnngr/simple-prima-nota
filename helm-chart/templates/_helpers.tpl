{{/*
Expand the name of the chart.
*/}}
{{- define "prima-nota.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "prima-nota.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "prima-nota.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "prima-nota.labels" -}}
helm.sh/chart: {{ include "prima-nota.chart" . }}
{{ include "prima-nota.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "prima-nota.selectorLabels" -}}
app.kubernetes.io/name: {{ include "prima-nota.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "prima-nota.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "prima-nota.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Connessione al database (DB_*): la stessa per il backend e per il job delle
migrazioni, qualunque sia il database scelto.
*/}}
{{- define "prima-nota.dbEnv" -}}
{{- if .Values.postgresql.enabled }}
# PostgreSQL Standalone
- name: DB_HOST
  value: {{ include "prima-nota.fullname" . }}-postgresql
- name: DB_PORT
  value: "5432"
- name: DB_NAME
  value: {{ .Values.postgresql.auth.database }}
- name: DB_USER
  value: {{ .Values.postgresql.auth.username }}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "prima-nota.fullname" . }}-secret
      key: postgres-password
{{- else if .Values.cloudnativepg.enabled }}
# CloudNativePG Cluster
- name: DB_HOST
  value: {{ .Values.cloudnativepg.cluster.name | default (printf "%s-postgres" (include "prima-nota.fullname" .)) }}-rw
- name: DB_PORT
  value: "5432"
- name: DB_NAME
  value: {{ .Values.cloudnativepg.cluster.bootstrap.database }}
- name: DB_USER
  value: {{ .Values.cloudnativepg.cluster.bootstrap.owner }}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "prima-nota.fullname" . }}-secret
      key: postgres-password
{{- else if .Values.externalDatabase.enabled }}
# Database Esterno
- name: DB_HOST
  value: {{ .Values.externalDatabase.host }}
- name: DB_PORT
  value: {{ .Values.externalDatabase.port | quote }}
- name: DB_NAME
  value: {{ .Values.externalDatabase.database }}
- name: DB_USER
  value: {{ .Values.externalDatabase.username }}
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalDatabase.existingSecret | default (printf "%s-secret" (include "prima-nota.fullname" .)) }}
      key: {{ .Values.externalDatabase.secretPasswordKey | default "postgres-password" }}
{{- end }}
{{- end }}

{{/*
Indirizzo pubblico dell'app, senza "/" finale: e' la base dei link nelle mail
(reset password, conferma email, notifiche) e l'origine ammessa dal CORS.
app.publicUrl, oppure lo schema e il primo host dell'ingress (https se quell'host
e' in ingress.tls). Mai l'indirizzo interno del servizio: dal browser di chi
riceve la mail non si apre.
*/}}
{{- define "prima-nota.publicUrl" -}}
{{- $u := trimSuffix "/" (.Values.app.publicUrl | default "") -}}
{{- if not $u -}}
  {{- if and .Values.ingress.enabled .Values.ingress.hosts -}}
    {{- $h := (index .Values.ingress.hosts 0).host -}}
    {{- $tls := false -}}
    {{- range .Values.ingress.tls -}}{{- if has $h .hosts -}}{{- $tls = true -}}{{- end -}}{{- end -}}
    {{- $u = printf "%s://%s" (ternary "https" "http" $tls) $h -}}
  {{- else -}}
    {{- fail "app.publicUrl e' obbligatorio senza ingress: e' l'indirizzo dei link nelle mail (es. https://primanota.example.it)" -}}
  {{- end -}}
{{- end -}}
{{- if not (regexMatch "^https?://[^/[:space:]]+(/[^[:space:]]*)?$" $u) -}}
  {{- fail (printf "app.publicUrl non valido: %q (atteso http(s)://host[/percorso])" $u) -}}
{{- end -}}
{{- $u -}}
{{- end -}}

{{/*
Valore di una variabile d'ambiente. I numeri dei values arrivano come float64:
senza conversione 10485760 diventa "1.048576e+07", che parseInt legge come 1.
*/}}
{{- define "prima-nota.envValue" -}}
{{- if and (kindIs "float64" .) (eq (float64 (int64 .)) .) -}}
{{- int64 . | toString | quote -}}
{{- else -}}
{{- toString . | quote -}}
{{- end -}}
{{- end -}}

{{/*
Volume degli allegati: una sola scrittura alla volta se ReadWriteOnce.
*/}}
{{- define "prima-nota.allegatiRWO" -}}
{{- $p := .Values.backend.allegati.persistence -}}
{{- if and $p.enabled (has "ReadWriteOnce" $p.accessModes) (not (has "ReadWriteMany" $p.accessModes)) -}}true{{- end -}}
{{- end -}}
