#!/usr/bin/env bash
# Pre-pull common exam images into the kind node so the first question that
# needs them starts instantly instead of waiting on a registry round-trip.
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
NODE="${CLUSTER_NAME}-control-plane"

if ! docker inspect "${NODE}" &>/dev/null; then
  echo "kind node ${NODE} not found — skip image pre-pull"
  exit 0
fi

# IMPORTANT: kubelet only ever looks at containerd's "k8s.io" namespace.
# Pulling into the default namespace (which is what `ctr images pull` does)
# stores a full copy of every image that no Pod can ever use, and kubelet
# re-pulls them from the internet anyway. The -n flag is what makes this
# script do anything at all.
CTR_NS=k8s.io

# Kept deliberately small: the alpine-based images the exams lean on most.
# Each entry costs disk in the node's containerd volume forever, so heavy
# images used by one or two questions (full nginx, bitnami/kubectl) are left
# to pull on demand — correctness does not depend on this list.
IMAGES=(
  docker.io/library/busybox:1.36
  docker.io/library/nginx:alpine
  docker.io/library/nginx:1.27-alpine
  docker.io/library/nginx:1.25-alpine
  docker.io/library/nginx:1.24-alpine
  docker.io/library/nginx:1.17.3-alpine
  docker.io/library/httpd:2.4-alpine
  docker.io/library/httpd:2.4.58-alpine
)

echo "Pre-pulling exam images into ${NODE} (containerd namespace: ${CTR_NS})..."
for img in "${IMAGES[@]}"; do
  echo "  → ${img}"
  docker exec "${NODE}" ctr -n "${CTR_NS}" images pull "${img}" >/dev/null 2>&1 \
    || echo "    (skipped or failed: ${img})"
done
echo "Image pre-pull complete."
