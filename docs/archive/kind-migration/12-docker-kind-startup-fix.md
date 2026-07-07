# 12 — Docker / kind Startup Fix

> **Branch:** `kind-migration`  
> **Session:** Fix `make up` failures on Apple Silicon  
> **Status:** Stack starts successfully; `/health` reports cluster ready

---

## Problem

`TARGETARCH=arm64 make up` failed at the `kind-init` one-shot service with exit code 1.

### Error 1 — Missing Docker CLI

```
failed to create cluster: failed to get docker info:
exec: "docker": executable file not found in $PATH
```

**Cause:** `kind-init` container had `kind` + `kubectl` but no `docker` binary. Kind talks to the host daemon via the mounted `/var/run/docker.sock`.

### Error 2 — kubeconfig DNS after cluster creation

Cluster was created successfully, but `kubectl wait` failed:

```
lookup ckad-simulator-control-plane on 127.0.0.11:53: no such host
```

**Cause:** `kind get kubeconfig --internal` writes the control-plane **hostname**, which is only resolvable on the `kind` Docker network. The `kind-init` and `backend` containers run on `ckad-network`, not `kind`.

---

## Fixes Applied

### 1. `docker/kind-init.Dockerfile`

- Added `docker-cli` to Alpine packages so kind can use the mounted socket.

### 2. `scripts/init-cluster.sh`

- Preflight checks: `docker` CLI present, socket mounted, `docker info` succeeds.
- Replaced `--internal` kubeconfig with **IP patching** (documented in `07-risks-and-mitigations.md`):

```bash
KIND_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "${CLUSTER_NAME}-control-plane")
kind get kubeconfig --name "${CLUSTER_NAME}" \
  | sed "s|127.0.0.1:[0-9]*|${KIND_IP}:6443|g" \
  > "${KUBECONFIG_OUTPUT}"
```

This lets both `kind-init` and `backend` reach the API server without joining the `kind` network.

---

## Verified

```bash
TARGETARCH=arm64 make up          # or: make up (auto-detects arm64)
curl http://localhost:3000/health # cluster.ready: true
make cluster                      # kubectl get nodes from backend
npm test                          # 20 tests pass
npm run validate:scenarios        # 17/17 OK
```

---

## Startup Contract (do not break)

Every change must keep this green:

| Step | Check |
|------|-------|
| `make up` | `kind-init` exits 0, `backend` healthy |
| `/health` | `"cluster": { "ready": true }` |
| Terminal | `kubectl get nodes` works in browser PTY |
| `make reset-q Q=N` | Scenario applies without error |

---

## Still Pending

- [ ] Mock auto-score using `clusterState` / `verify.sh`
- [ ] Practice module scenarios
- [ ] Full README rewrite (Docker-first)
- [ ] CI smoke: `make up` + curl `/health`
- [ ] Mock exam 2/3
- [ ] Optional: ingress controller for Q11

---

## Run

```bash
make up
open http://localhost:3000
make reset-q Q=1
make down
```

Apple Silicon: `make up` auto-sets `TARGETARCH=arm64` via Makefile.
