# 11 — Scenarios, Cluster Evidence, and Polish

> **Branch:** `kind-migration`  
> **Session:** Phase 3 completion + Phase 5/6 partial  
> **Status:** Mock exam 1 fully scenario-backed; cluster evidence live; UI waits for cluster

---

## Completed in This Session

### Phase 3 — All Mock Exam 1 Scenarios (Q1–Q17)

| Q | Topic | Scenario contents |
|---|-------|-------------------|
| Q1 | Liveness probe | `project-23-api` Deployment (no probe yet) |
| Q2 | Deploy + Service | Namespace + `sa-sun-deploy` ServiceAccount |
| Q3 | Service debug | `earth-3cc-web` Deployment (bad readiness port) + Service |
| Q4 | CronJob | Empty namespace |
| Q5 | NetworkPolicy | frontend / backend / database Pods |
| Q6 | ConfigMap + Secret | Empty namespace |
| Q7 | Canary | `web-app` Deployment (5 replicas) + `web-app-svc` |
| Q8 | Multi-container | Empty namespace |
| Q9 | PVC | Empty namespace |
| Q10 | RBAC | `inspector` Pod (kubectl without RBAC) |
| Q11 | Ingress | `app-svc` + `api-svc` with backing Deployments |
| Q12 | Rollout / rollback | `rolling-app` Deployment (`httpd:2.4-alpine`) |
| Q13 | Security context | Empty namespace |
| Q14 | Helm | Empty namespace (bitnami repo added at cluster init) |
| Q15 | Job from CronJob | `backup-job` CronJob |
| Q16 | Resource limits | `compute-quota` ResourceQuota |
| Q17 | Debug CrashLoop | `web-app` Deployment (bad image + probe) |

- Q1 `verify.sh` checks livenessProbe tcpSocket on port 80
- `scripts/validate-scenarios.js` — `npm run validate:scenarios`
- `scripts/sync-kind-namespaces.js` — maps themed names → `exam-qN` in exam/answer JSON

### Exam Content Alignment

- `exam.json` and `answer.json` namespace references updated: `pluto` → `exam-q1`, `sun` → `exam-q2`, etc.
- `exams/mock/1/course/p1/project-23-api.yaml` namespace set to `exam-q1`
- Terminal `INITIAL_NAMESPACE` and scenario namespaces are now consistent with question text

### Phase 5 — Cluster Evidence (partial)

- `collectEvidence()` is async and queries real cluster state per question namespace
- `GET /api/session/evidence?questions=0,1,2` returns `clusterState` with pods, deployments, services, etc.
- Practice check and exam review pass question indices for targeted evidence

### Phase 6 — Polish

- Landing page polls `/health` and shows **“Starting Kubernetes cluster…”** until ready
- Error banner with `make up` hint if cluster unreachable
- `scripts/pre-pull-images.sh` — pulls common exam images into kind node
- `init-cluster.sh` — adds bitnami Helm repo + runs pre-pull
- `README.md` — Docker/kind quick start section
- `package.json` — `validate:scenarios` script
- Toast message fixed to English (`Session restored`)

---

## Verification

```bash
npm run build        # pass
npm test             # 20 tests pass
npm run validate:scenarios  # 17 scenarios OK
```

---

## Architecture After This Session

```
Browser landing → waitForClusterReady() → /health
Exam start      → resetSandbox → delete exam-q* namespaces
Open terminal   → ensureQuestionScenario(qN) → kubectl apply scenarios/qN/
Check answer    → evidence?questions=N → kubectl get -o json (clusterState)
```

---

## Still Pending (Next Session)

### Phase 5 — Scoring depth

- [ ] Use `clusterState` in mock auto-score (`scoreOneCriterion` checks real resources)
- [ ] Run `verify.sh` from backend for practice/mock scoring
- [ ] Optional `verify:` lines in answer JSON schema

### Phase 6 — Production hardening

- [ ] E2E smoke test script (`scripts/test-e2e.sh`) in CI
- [ ] Ingress controller in kind for Q11 end-to-end HTTP tests (optional)
- [ ] Practice module scenarios under `exams/practice/*/scenarios/`
- [ ] Full README rewrite (remove outdated simulation sections)
- [ ] `docker compose` health gate: backend waits for cluster before accepting traffic

### Content

- [ ] Align Q1 exam text with Deployment (not Pod) — done in scenario; verify scoring criteria
- [ ] Mock exam 2 / 3 with scenario sets
- [ ] Weight sum validation (exam 1 weights should total 100%)

### DevOps

- [ ] GitHub/GitLab CI: build images + `validate:scenarios` + unit tests
- [ ] Document `TARGETARCH=arm64` for Apple Silicon in CONTRIBUTING.md

---

## How to Test End-to-End

```bash
TARGETARCH=arm64 make up    # or make up on Intel
open http://localhost:3000  # wait for cluster banner to clear
# Start Mock Exam 1 → Q1 terminal:
kubectl get deploy -n exam-q1
kubectl get nodes
make reset-q Q=1
```

---

## Related Docs

| Doc | Purpose |
|-----|---------|
| [10-implementation-progress.md](./10-implementation-progress.md) | Previous session log |
| [05-exam-scenarios-structure.md](./05-exam-scenarios-structure.md) | Scenario format reference |
| [08-quick-start.md](./08-quick-start.md) | Install and troubleshooting |
