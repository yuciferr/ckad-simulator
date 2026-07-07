# 10 — Implementation Progress (Session Log)

> **Branch:** `kind-migration`  
> **Status:** Phases 0–2 complete; Phase 3 partial; legacy simulation removed

---

## Completed

### Phase 0 — Preparation
- [x] `kind-migration` branch
- [x] Planning docs `00`–`09`
- [x] Scenario dirs created only when manifests exist (no `.gitkeep`)

### Phase 1 — Docker + kind
- [x] `docker-compose.yml` — `kind-init` + `backend`
- [x] `docker/backend.Dockerfile`, `docker/kind-init.Dockerfile`, `docker/kind-config.yaml`
- [x] `scripts/init-cluster.sh`, `reset-question.sh`, `wait-for-cluster.sh`
- [x] `Makefile` — `make up`, `make down`, `make reset-q Q=N`
- [x] Course files mounted: `exams/mock/1/course` → `/opt/course`

### Phase 2 — Backend
- [x] `src/sandbox/kubectl.ts`, `scenario.ts`, `cluster.ts`
- [x] Kind-only PTY (`src/ws/terminal.ts`)
- [x] Simplified `reset.ts` / `evidence.ts` (no simulation state)
- [x] `/health` reports cluster status
- [x] Default `SANDBOX_MODE=kind`

### Repo cleanup (this session)
- [x] Removed legacy simulation: `sandbox/bin/*`, `sandbox/etc/kubernetes/mock/*`, `.bashrc`, `.vimrc`
- [x] `sandbox/` is runtime-only — tracked: `sandbox/README.md` only
- [x] Course seeds moved to `exams/mock/1/course/`
- [x] Removed root `Dockerfile` (use `docker/backend.Dockerfile`)
- [x] Removed `scripts/tests/sandbox.bats` (simulation smoke tests)
- [x] `.gitignore` — ignore `**/.gitkeep`, simplify sandbox rules
- [x] Rewrote last 4 commits without `.gitkeep` pollution

### Phase 3 — Scenarios (partial)
- [x] Q1 liveness probe + `verify.sh`
- [x] Q2 empty namespace
- [x] Q3 service selector debug
- [ ] Q4–Q17 manifests

---

## Directory map (after cleanup)

| Path | Purpose | In git? |
|------|---------|---------|
| `sandbox/` | Runtime PTY workspace (history, user files) | README only |
| `src/sandbox/` | Backend: kubectl, scenarios, reset, evidence, cluster | Yes |
| `exams/mock/1/scenarios/qN/` | Kind scenario YAMLs | When `setup.yaml` exists |
| `exams/mock/1/course/` | `/opt/course` seed files | Yes |
| `docker/` | Container images + shell config | Yes |
| `etc/` (repo root) | Legacy runtime leak | Ignored, delete locally |

---

## Pending

- [ ] Q4–Q17 scenario YAMLs
- [ ] Cluster-state scoring in evidence collection
- [ ] E2E: `make up` → browser → `kubectl get nodes`
- [ ] Frontend “Cluster starting…” when `/health` is `initializing`
- [ ] Update root `README.md` for Docker-first install

---

## Run

```bash
make up                    # Apple Silicon: TARGETARCH=arm64 make up
open http://localhost:3000
make reset-q Q=1
```

Local dev without Docker still requires a reachable cluster and `SANDBOX_MODE=kind`.
