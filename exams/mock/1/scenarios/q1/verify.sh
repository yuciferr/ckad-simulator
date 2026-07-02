#!/usr/bin/env bash
set -euo pipefail
NS="${1:-exam-q1}"

PROBE=$(kubectl get deploy project-23-api -n "${NS}" \
  -o jsonpath='{.spec.template.spec.containers[0].livenessProbe.tcpSocket.port}' 2>/dev/null || true)

if [ "${PROBE}" = "80" ]; then
  echo "PASS: livenessProbe tcpSocket on port 80"
  exit 0
fi

echo "FAIL: livenessProbe not configured (port=${PROBE:-none})"
exit 1
