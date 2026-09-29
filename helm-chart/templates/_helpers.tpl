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
