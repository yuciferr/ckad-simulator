#!/usr/bin/env bash
# Pre-pull common exam images into the kind node (speeds up first question reset).
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
NODE="${CLUSTER_NAME}-control-plane"

if ! docker inspect "${NODE}" &>/dev/null; then
  echo "kind node ${NODE} not found — skip image pre-pull"
  exit 0
fi

IMAGES=(
  docker.io/library/nginx:1.25
  docker.io/library/nginx:1.24-alpine
  docker.io/library/nginx:alpine
  docker.io/library/nginx:1.17.3-alpine
  docker.io/library/busybox:1.36
  docker.io/library/httpd:2.4-alpine
  docker.io/library/httpd:2.4.58-alpine
  docker.io/bitnami/kubectl:1.32
)

echo "Pre-pulling exam images into kind node..."
for img in "${IMAGES[@]}"; do
  echo "  → ${img}"
  docker exec "${NODE}" ctr images pull "${img}" 2>/dev/null || echo "    (skipped or failed: ${img})"
done
echo "Image pre-pull complete."
