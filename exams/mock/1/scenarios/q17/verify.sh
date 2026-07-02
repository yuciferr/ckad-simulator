#!/usr/bin/env bash
set -euo pipefail
NS="${1:-exam-q17}"

PHASE=$(kubectl get pods -n "${NS}" -l app=web-app \
  -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)

if [ "${PHASE}" = "Running" ]; then
  echo "PASS: web-app pod Running"
  exit 0
fi

IMAGE=$(kubectl get deploy web-app -n "${NS}" \
  -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)

if [[ "${IMAGE}" == *"nginx"* ]] && [[ "${IMAGE}" != *"broken"* ]]; then
  echo "PASS: web-app uses fixed image (${IMAGE})"
  exit 0
fi

echo "FAIL: web-app not healthy (phase=${PHASE:-unknown}, image=${IMAGE:-none})"
exit 1
