#!/usr/bin/env bash
set -euo pipefail

KUBECONFIG="${KUBECONFIG:-/etc/kind/kubeconfig}"
TIMEOUT="${1:-120}"
INTERVAL=2
ELAPSED=0

echo "Waiting for Kubernetes cluster (timeout: ${TIMEOUT}s)..."

while [ "${ELAPSED}" -lt "${TIMEOUT}" ]; do
  if kubectl cluster-info &>/dev/null; then
    echo "Cluster is ready."
    exit 0
  fi
  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "ERROR: Cluster not ready after ${TIMEOUT}s" >&2
exit 1
