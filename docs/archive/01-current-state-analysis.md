# 01 — Current State Analysis

> **Last updated:** July 2026  
> **Scope:** Full repository audit — files, content, completeness, and known gaps.

---

## 1. Project Purpose

CKAD Simulator is a **locally-run, browser-based practice environment** for the Certified Kubernetes Application Developer (CKAD) exam. It provides:

- A PSI-style exam interface (split pane: question panel + live terminal)
- A real bash shell with a simulated `kubectl`, `helm`, `docker`, and `podman`
- Two learning modes: timed **Mock Exams** and untimed **Practice Modules**
- Automatic scoring heuristics based on terminal command history and applied files

The project started as a personal learning tool and is being evolved into a fully open-source resource for developers preparing for CKAD, CKA, and other Kubernetes certifications.

---

## 2. Repository Snapshot (July 2026)

### 2.1 Git Status

```
M  sandbox/bin/k8s-lib.sh     ← active development (dry-run YAML work)
M  sandbox/bin/kubectl         ← active development
?? sandbox/dev-null-kubeconfig ← untracked, unused placeholder
?? scripts/test-core-concepts-sandbox.sh ← untracked smoke test
```

**Most recent commits:**

| Hash | Message |
|------|---------|
| `d2026a8` | fix: generate dry-run YAML natively without cluster connection |
| `45dbd4e` | fix: practice answer format + check-answer UI |
| `31a0eae` | feat: practice mode scoring, dry-run sandbox |
| `2f1d43b` | feat: CKAD practice modules + session-scoped sandbox |
| `a687358` | fix: kubectl get -n/-o yaml + sandbox reset |
| `d67b578` | feat: auto-scoring review mode |
| `c1d9823` | docs: comprehensive README |
| `6748e3d` | feat: initial CKAD exam simulator |

The project reached a functional v1.0 core in approximately **8 commits over ~2 weeks**, indicating rapid, focused development.

---

### 2.2 Complete File Tree

```
ckad-simulator/
├── .gitignore
├── README.md                          (361 lines)
├── package.json
├── package-lock.json
├── server.js                          (627 lines)
│
├── public/
│   ├── index.html
│   ├── app.js                         (1544 lines)
│   └── style.css                      (1213 lines)
│
├── exams/
│   ├── exam1.md                       (17 questions, mock exam)
│   ├── answer1.md                     (~856 lines, scoring criteria + solutions)
│   ├── core_concepts/
│   │   ├── exam.md                    (18 questions)
│   │   └── answer.md
│   ├── multi_container_pods/
│   │   ├── exam.md                    (2 questions)
│   │   └── answer.md
│   ├── pod_design/
│   │   ├── exam.md                    (51 questions)
│   │   └── answer.md
│   ├── configuration/
│   │   ├── exam.md                    (30 questions)
│   │   └── answer.md
│   ├── observability/
│   │   ├── exam.md                    (8 questions)
│   │   └── answer.md
│   ├── services/
│   │   ├── exam.md                    (9 questions)
│   │   └── answer.md
│   ├── state/
│   │   ├── exam.md                    (6 questions)
│   │   └── answer.md
│   ├── helm/
│   │   ├── exam.md                    (10 questions)
│   │   └── answer.md
│   ├── crd/
│   │   ├── exam.md                    (4 questions)
│   │   └── answer.md
│   └── podman/
│       ├── exam.md                    (12 questions)
│       └── answer.md
│
├── scripts/
│   ├── convert-ckad-exercises.js      (converts dgkanatsios/CKAD-exercises format)
│   ├── normalize-answer-format.js     (normalizes answer.md formatting)
│   └── test-core-concepts-sandbox.sh  (UNTRACKED: smoke test)
│
└── sandbox/
    ├── .bashrc                        (shell environment + security)
    ├── .vimrc                         (YAML-friendly vim config)
    ├── dev-null-kubeconfig            (UNTRACKED: empty kubeconfig template)
    ├── bin/
    │   ├── kubectl                    (809 lines — core simulation)
    │   ├── k → kubectl                (symlink)
    │   ├── k8s-lib.sh                 (1003 lines — state management)
    │   ├── helm
    │   ├── docker
    │   ├── podman
    │   ├── crictl
    │   ├── ssh
    │   ├── kubectx
    │   └── kubens
    ├── opt/course/
    │   ├── p1/project-23-api.yaml     (only real YAML template)
    │   └── p7, p12, p15, p17/README.txt  (placeholder text only)
    └── etc/kubernetes/
        └── mock/                      (static kubectl output fixtures)
            ├── pluto/
            ├── earth/   (pods, deploy, services, 2 YAML files)
            ├── mars/
            ├── neptune/
            ├── saturn/
            ├── titan/
            ├── pandora/
            ├── uranus/
            └── callisto/
```

**Runtime-only directories (git-ignored):**
- `sandbox/etc/kubernetes/namespace`
- `sandbox/etc/kubernetes/context`
- `sandbox/etc/kubernetes/session/`
- `sandbox/etc/kubernetes/applied/`
- `sandbox/.bash_history_q*`
- `sandbox/.exam-session.json`

---

## 3. Content Inventory

### 3.1 Mock Exam 1 (17 Questions)

| Q# | Topic | Namespace | Weight | Fixture Status |
|----|-------|-----------|--------|----------------|
| 1 | Liveness Probe | pluto | 7% | Partial (pods.txt only) |
| 2 | Deployment + Service | sun | 4% | **Missing** |
| 3 | Troubleshoot Service | earth | 7% | Good (pods/deploy/svc/yaml) |
| 4 | CronJob | moon | 5% | **Missing** |
| 5 | NetworkPolicy | neptune | 7% | Partial |
| 6 | ConfigMap + Secret | mercury | 4% | **Missing** |
| 7 | Canary Deployment | mars | 7% | Partial |
| 8 | Multi-container Sidecar | venus | 5% | **Missing** |
| 9 | PVC | jupiter | 4% | **Missing** |
| 10 | RBAC | saturn | 7% | Partial |
| 11 | Ingress | uranus | 5% | Partial |
| 12 | Rolling Update / Rollback | titan | 4% | Partial |
| 13 | Security Context | io | 5% | **Missing** |
| 14 | Helm | europa | 5% | **Missing** |
| 15 | Job from CronJob | callisto | 4% | Partial |
| 16 | Resource Requests/Limits | ganymede | 5% | **Missing** |
| 17 | Image Build + Debugging | pandora | 8% | Partial |

**Weight sum: 93%** — missing 7% (documentation/calculation inconsistency).

**opt/course/ file references in exam1 that are missing from the repository:**
- `p2/sunny_status_command.sh`
- `p3/ticket-654.txt`
- `p3/ticket-778.txt`
- Various namespace fixtures for: sun, moon, mercury, venus, jupiter, io, europa, ganymede

### 3.2 Practice Modules

| Module | Questions | Duration | CKAD Weight | Status |
|--------|-----------|----------|-------------|--------|
| core_concepts | 18 | 90 min | 13% | Complete |
| multi_container_pods | 2 | — | 10% | Minimal |
| pod_design | 51 | 255 min | 20% | Complete |
| configuration | 30 | — | 18% | Complete |
| observability | 8 | — | 18% | Complete |
| services | 9 | — | 13% | Complete |
| state | 6 | — | 8% | Complete |
| helm | 10 | 50 min | — | Complete |
| crd | 4 | — | — | Complete |
| podman | 12 | — | — | Complete |

**Total practice questions: ~150** (sourced from dgkanatsios/CKAD-exercises).

---

## 4. Completeness Assessment

| Area | Status | Score |
|------|--------|-------|
| Server (API + WebSocket) | Complete | ✅ 95% |
| Terminal sandbox isolation | Complete | ✅ 90% |
| kubectl simulation (core) | Functional | 🟡 70% |
| kubectl simulation (advanced) | Surface-level | 🟡 50% |
| Mock Exam 1 content | Partial | 🟠 60% |
| Mock Exam 1 fixtures | Incomplete | 🔴 55% |
| Practice modules content | Complete | ✅ 90% |
| Auto-scoring (mock) | Heuristic | 🟡 65% |
| Practice answer checking | Good | ✅ 80% |
| Documentation (README) | Good | ✅ 85% |
| Developer documentation | None → being created | 🔴 0% → 100% |
| Tests / CI | Missing | 🔴 5% |
| Docker / one-command setup | Missing | 🔴 0% |
| Second mock exam | Missing | 🔴 0% |

**Overall project completeness: ~65%** for the intended open-source scope.

---

## 5. Known Bugs and Inconsistencies

### 5.1 SSH Implementation Conflict

The `.bashrc` defines an `ssh()` **function** that runs in the same shell process and changes the prompt. However, `sandbox/bin/ssh` is a **separate executable** that spawns a new `exec bash` subshell. When `sandbox/bin/` is first in `PATH` (which it is), `bin/ssh` takes precedence over the `.bashrc` function, contradicting the README statement "no subshell is spawned."

**Impact:** Minor but misleading. Users might see unexpected behavior depending on bash source order.

### 5.2 Weight Sum Mismatch

Mock Exam 1 question weights sum to **93%**, not 100%. This causes the review scoring display to be mathematically incorrect and confusing.

### 5.3 Unused `dev-null-kubeconfig`

The file `sandbox/dev-null-kubeconfig` is committed but never referenced in code. The current approach uses `KUBECONFIG=/dev/null` (env var). This file is dead code.

### 5.4 kubectl apply Partial State Tracking

`kubectl apply -f` only registers **Pod**, **Deployment**, and **Namespace** resources via `register_resource_from_yaml`. Applying a **Service**, **ConfigMap**, **Secret**, **CronJob**, or **Ingress** manifest does not create a corresponding state entry, so `kubectl get service` will return nothing after an `apply`.

### 5.5 helm Release State

`helm install` outputs a success message but does not persist any release state. `helm list`, `helm status`, and `helm upgrade` will not reflect installed releases.

---

## 6. Summary

The CKAD Simulator has a **solid, working v1.0 core**. The server, sandbox isolation, terminal multiplexing, and UI are production-quality for a local dev tool. The main blockers for the intended open-source vision are:

1. **Incomplete mock exam fixtures** — many namespaces and `opt/course` files are referenced but not committed.
2. **Shallow kubectl simulation** for non-Pod resource types.
3. **No CI/CD or Docker setup** — high friction for new contributors.
4. **No second mock exam** — limits exam variety.
5. **No automated tests** — regressions are only caught manually.
