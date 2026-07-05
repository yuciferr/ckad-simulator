#!/usr/bin/env bash
set -euo pipefail
NS="${1:-exam-q3}"

PORT=$(kubectl get deploy earth-3cc-web -n "${NS}" \
  -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.tcpSocket.port}' 2>/dev/null || true)

if [ "${PORT}" = "80" ]; then
  READY=$(kubectl get deploy earth-3cc-web -n "${NS}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
  echo "PASS: readinessProbe port 80 (readyReplicas=${READY})"
  exit 0
fi

echo "FAIL: readinessProbe port=${PORT:-none}"
exit 1
