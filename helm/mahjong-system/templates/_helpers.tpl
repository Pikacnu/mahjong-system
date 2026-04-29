{{- define "mahjong-system.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mahjong-system.postgresService" -}}
{{- printf "%s-postgresql" (include "mahjong-system.fullname" .) -}}
{{- end -}}
