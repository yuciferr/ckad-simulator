#!/usr/bin/env bash
set -euo pipefail

NS="${1:-exam-q1}"
PROBE_PATH="$(kubectl get pod pod1 -n "${NS}" -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.path}' 2>/dev/null || true)"

if [ "${PROBE_PATH}" = "/" ] || [ "${PROBE_PATH}" = "/healthz" ] || [ "${PROBE_PATH}" = "/health" ]; then
  echo "PASS: liveness probe path corrected to ${PROBE_PATH}"
  exit 0
fi

echo "FAIL: liveness probe path is still '${PROBE_PATH}'"
exit 1
