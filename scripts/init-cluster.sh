#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
KUBECONFIG_OUTPUT="${KUBECONFIG_OUTPUT:-/etc/kind/kubeconfig}"
MAX_WAIT="${KIND_WAIT_SECONDS:-120}"

echo "=== CKAD Simulator — kind cluster init ==="
echo "Cluster name : ${CLUSTER_NAME}"
echo "kubeconfig   : ${KUBECONFIG_OUTPUT}"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' already exists, skipping creation."
else
  echo "Creating kind cluster (first run may take ~60s)..."
  kind create cluster \
    --name "${CLUSTER_NAME}" \
    --config /kind-config.yaml \
    --wait "${MAX_WAIT}s"
  echo "Cluster created."
fi

mkdir -p "$(dirname "${KUBECONFIG_OUTPUT}")"
kind get kubeconfig --name "${CLUSTER_NAME}" --internal > "${KUBECONFIG_OUTPUT}"
chmod 644 "${KUBECONFIG_OUTPUT}"
echo "kubeconfig written (internal Docker network address)."

echo "Waiting for nodes to be Ready..."
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl wait \
  --for=condition=Ready \
  nodes --all \
  --timeout="${MAX_WAIT}s"

echo "=== Cluster init complete ==="
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl get nodes

# Helm repo for Q14 (exam-q14)
if command -v helm &>/dev/null; then
  echo "Adding bitnami Helm repo..."
  KUBECONFIG="${KUBECONFIG_OUTPUT}" helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
  KUBECONFIG="${KUBECONFIG_OUTPUT}" helm repo update || true
fi

# Pre-pull common exam images (optional, speeds up resets)
if [ -f /pre-pull-images.sh ]; then
  KIND_CLUSTER_NAME="${CLUSTER_NAME}" bash /pre-pull-images.sh || true
fi
