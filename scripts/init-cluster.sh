#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
KUBECONFIG_OUTPUT="${KUBECONFIG_OUTPUT:-/etc/kind/kubeconfig}"
MAX_WAIT="${KIND_WAIT_SECONDS:-120}"

echo "=== CKAD Simulator — kind cluster init ==="
echo "Cluster name : ${CLUSTER_NAME}"
echo "kubeconfig   : ${KUBECONFIG_OUTPUT}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker CLI not found in kind-init container."
  echo "Rebuild with: docker compose build kind-init"
  exit 1
fi

if [ ! -S /var/run/docker.sock ]; then
  echo "ERROR: Docker socket not mounted at /var/run/docker.sock."
  echo "Enable Docker Desktop socket sharing (Settings → Advanced)."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Cannot connect to Docker daemon via /var/run/docker.sock."
  exit 1
fi

echo "Docker daemon: OK"

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

# kind --internal uses hostname (ckad-simulator-control-plane) which is only
# resolvable on the kind Docker network. Patch with control-plane IP instead
# so kind-init and backend containers can reach the API server.
KIND_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "${CLUSTER_NAME}-control-plane")
if [ -z "${KIND_IP}" ]; then
  echo "ERROR: Could not resolve IP for ${CLUSTER_NAME}-control-plane container."
  exit 1
fi

kind get kubeconfig --name "${CLUSTER_NAME}" \
  | sed "s|127.0.0.1:[0-9]*|${KIND_IP}:6443|g" \
  > "${KUBECONFIG_OUTPUT}"
chmod 644 "${KUBECONFIG_OUTPUT}"
echo "kubeconfig written (${KIND_IP}:6443)."

# CKAD lab-host kube-contexts — real named contexts (same cluster/user as the
# base context) so `ssh <host>` (docker/bashrc) and `kubectl config
# use-context <host>` both resolve to something real. This is the lightweight
# stand-in for the multi-node/multi-cluster jump hosts of the real exam: no
# extra VM or cluster, just extra context stanzas in the one kubeconfig.
# Keep this list in sync with the "ssh <host>" hints in exams/mock/*/exam.json.
CKAD_LAB_HOSTS="ckad9043 ckad5601 ckad7913"
BASE_CONTEXT=$(KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl config current-context)
BASE_CLUSTER=$(KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl config view \
  -o jsonpath="{.contexts[?(@.name==\"${BASE_CONTEXT}\")].context.cluster}")
BASE_USER=$(KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl config view \
  -o jsonpath="{.contexts[?(@.name==\"${BASE_CONTEXT}\")].context.user}")
echo "Provisioning CKAD lab-host kube-contexts: ${CKAD_LAB_HOSTS}"
for host in ${CKAD_LAB_HOSTS}; do
  KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl config set-context "${host}" \
    --cluster="${BASE_CLUSTER}" --user="${BASE_USER}" >/dev/null
done
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl config use-context "${BASE_CONTEXT}" >/dev/null
chmod 644 "${KUBECONFIG_OUTPUT}"

echo "Waiting for nodes to be Ready..."
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl wait \
  --for=condition=Ready \
  nodes --all \
  --timeout="${MAX_WAIT}s"

echo "=== Cluster init complete ==="
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl get nodes

# NOTE: the bitnami Helm repo that mock Q14 depends on is added in
# docker/backend.Dockerfile, not here. Helm repos are client-side config in
# $HOME, so adding one inside this throwaway container would never be visible
# to the exam shell — which is why Q14 used to claim a repo that did not exist.

# Pre-pull common exam images (optional, speeds up resets)
if [ -f /pre-pull-images.sh ]; then
  KIND_CLUSTER_NAME="${CLUSTER_NAME}" bash /pre-pull-images.sh || true
fi

# Ingress controller for mock Q11 (kind port maps 30080/30443 in kind-config.yaml)
echo "Installing ingress-nginx for kind..."
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl apply -f \
  https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/kind/deploy.yaml \
  2>/dev/null || true
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl wait \
  --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s 2>/dev/null || echo "WARN: ingress-nginx not ready yet (Q11 may need retry)"
