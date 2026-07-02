#!/usr/bin/env bash
set -euo pipefail
NS="${1:-exam-q1}"

JSON=$(kubectl get deploy project-23-api -n "${NS}" -o json 2>/dev/null || true)
if [ -z "${JSON}" ]; then
  echo "FAIL: Deployment project-23-api not found"
  exit 1
fi

PORT=$(echo "${JSON}" | jq -r '.spec.template.spec.containers[0].livenessProbe.tcpSocket.port // empty')
DELAY=$(echo "${JSON}" | jq -r '.spec.template.spec.containers[0].livenessProbe.initialDelaySeconds // empty')
PERIOD=$(echo "${JSON}" | jq -r '.spec.template.spec.containers[0].livenessProbe.periodSeconds // empty')

if [ "${PORT}" = "80" ] && [ "${DELAY}" = "10" ] && [ "${PERIOD}" = "15" ]; then
  echo "PASS: livenessProbe tcpSocket:80 delay=10 period=15"
  exit 0
fi

echo "FAIL: livenessProbe port=${PORT:-none} delay=${DELAY:-none} period=${PERIOD:-none}"
exit 1
