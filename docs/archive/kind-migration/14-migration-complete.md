# 14 — Migration Complete

> **Branch:** `kind-migration`  
> **Status:** Migration complete — kind is the default and only supported runtime

---

## Summary

The CKAD Simulator has migrated from a bash-based kubectl simulation (~4,500 lines) to a **real kind Kubernetes cluster** behind a browser terminal. All planned phases (0–6) from [03-migration-phases.md](./03-migration-phases.md) are implemented.

**Target architecture (achieved):**

```
Browser → xterm.js → WebSocket → PTY → bash → real kubectl → kind cluster
```

---

## Phase Checklist

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | Branch, docs 00–09, scenario layout | ✅ |
| 1 | Docker Compose, kind-init, kubeconfig IP patch | ✅ |
| 2 | Real PTY, kubectl/helm/vim, namespace context | ✅ |
| 3 | Mock exam 1 scenarios Q1–Q17 | ✅ |
| 4 | Legacy simulation removed | ✅ |
| 5 | Cluster evidence, verify.sh, auto-score | ✅ |
| 6 | Landing cluster wait, async scenarios, README | ✅ |

---

## Session Log Index

| Doc | Session |
|-----|---------|
| [10-implementation-progress.md](./10-implementation-progress.md) | Initial implementation |
| [11-scenarios-cluster-evidence-and-polish.md](./11-scenarios-cluster-evidence-and-polish.md) | Q1–Q17 + evidence API |
| [12-docker-kind-startup-fix.md](./12-docker-kind-startup-fix.md) | docker-cli + kubeconfig IP |
| [13-writable-course-async-scenarios-practice.md](./13-writable-course-async-scenarios-practice.md) | Writable course + practice |
| **14-migration-complete.md** | **This document** |

---

## Delivered Features

### Infrastructure
- `docker compose up` / `make up` — kind cluster + backend
- Control-plane kubeconfig IP patching (works from Compose network)
- ingress-nginx for mock Q11
- Image pre-pull + bitnami Helm repo at init
- `Makefile`: up, down, reset-q, cluster, logs

### Exam runtime
- Writable `/opt/course` (seed copy on exam reset)
- Async scenario apply with terminal overlay progress
- Mock: `exam-qN` namespaces + scenario YAMLs
- Practice: `default` namespace + optional scenario manifests
- Pre-warm Q1 scenario after exam reset

### Scoring (Phase 5)
- `GET /api/session/evidence?questions=0,1,2` — commands, files, **clusterState**, **verify**
- Backend runs `scenarios/qN/verify.sh` when present
- Mock review auto-score uses cluster state + verify + files + history
- verify.sh scripts: Q1, Q3, Q10, Q17 (extensible pattern)

### Content
- Mock exam 1: 17 scenarios, course seeds, aligned namespaces
- Practice: 10 modules; scenarios for observability Q4, services Q9
- `npm run validate:scenarios` — mock + practice

### Documentation
- Root `README.md` rewritten (Docker-first)
- `docs/kind-migration/` planning + progress series

---

## Explicitly Out of Scope (by design)

These were listed in planning docs but are **not required** for migration completion:

- CI/CD pipelines
- Unit test expansion / E2E shell scripts
- Mock exam 2 and 3 (no content in repo)
- Full verify.sh for all 17 questions (pattern established; add incrementally)
- Simulation mode (`SANDBOX_MODE=simulation` removed with legacy code)

---

## Startup Contract

Keep these green after any change:

```bash
make up
curl -s http://localhost:3000/health | jq .cluster.ready   # true
# Mock Q1: vim /opt/course/p1/project-23-api-new.yaml — save works
# Terminal: kubectl get nodes
make reset-q Q=1
npm run validate:scenarios
```

---

## Run

```bash
make up
open http://localhost:3000
```

Migration branch is ready to merge when review passes.
