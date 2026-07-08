# CKAD Simulator

A local, browser-based practice environment for the **Certified Kubernetes Application Developer (CKAD)** exam. It replicates the PSI exam interface with a real interactive terminal backed by a **kind Kubernetes cluster** — kubectl, helm, and vim run against a live cluster inside Docker.

---

## Features

| Feature | Details |
|---|---|
| **PSI-like UI** | Split pane: question panel on the left, terminal on the right |
| **Real Kubernetes** | kind cluster (v1.32.3) — every `kubectl apply` hits a real API server |
| **Per-question namespaces** | Mock exam uses isolated `exam-qN` namespaces with scenario seeds |
| **Writable course files** | `/opt/course/pN/` files are copied to a writable workspace on exam start |
| **Async scenario setup** | Terminal opens immediately; cluster prep runs in the background with UI feedback |
| **Practice modules** | 10 CKAD topic modules with command-history scoring |
| **Mock exam scoring** | Review mode auto-scores from cluster state, course files, command history, and `verify.sh` |
| **Timer & flagging** | Configurable countdown, question navigation, flag for review |
| **Notepad** | Built-in scratch pad per exam session |

---

## Architecture

```
Browser (xterm.js)  ←──WebSocket──→  Node.js backend (node-pty)
                                            │
                                    real bash + kubectl + helm
                                            │
                                    kind cluster (ckad-simulator)
```

1. `docker compose up` starts a **kind-init** job (creates cluster) and the **backend** (web + terminals).
2. Each question terminal is a PTY with `KUBECONFIG=/etc/kind/kubeconfig`.
3. Scenario YAMLs under `exams/mock/1/scenarios/qN/` seed the cluster per question.
4. Course task files are seeded from `exams/mock/1/course/` into a writable sandbox copy.

The kind control-plane container (`ckad-simulator-control-plane`) appears **outside** the Compose group in Docker Desktop — kind creates it directly via the host Docker socket. This is expected.

---

## Requirements

- **Docker Engine / Docker Desktop** 24+
- **Docker Compose** v2
- **8 GB RAM** recommended (kind uses ~1 GB)

Optional for local dev without Docker:

- **Node.js** ≥ 18, **kubectl** 1.32+, reachable kind cluster, `SANDBOX_MODE=kind`

---

## Quick Start

```bash
git clone <repo-url> ckad-simulator
cd ckad-simulator

./install.sh     # one-shot: preflight → build → start → wait until ready
```

`install.sh` checks Docker/Compose, detects your architecture, verifies the port
is free, brings the stack up, and blocks until the cluster is ready before
opening the browser. It is idempotent (safe to re-run).

```bash
./install.sh --port 3001    # expose on a different host port
./install.sh --no-browser   # don't auto-open the browser
```

Or drive Compose directly:

```bash
make up          # auto-detects arm64 on Apple Silicon
open http://localhost:3000
```

First run creates the kind cluster (~60s). The landing page shows **“Starting Kubernetes cluster…”** until `/health` reports ready.

```bash
make down          # stop containers
make reset-q Q=3   # reset mock exam Q3 namespace + scenario
make cluster       # kubectl get nodes (from backend container)
make logs          # follow backend logs
```

Apple Silicon: `make up` sets `TARGETARCH=arm64` automatically.

See [docs/archive/kind-migration/08-quick-start.md](docs/archive/kind-migration/08-quick-start.md) for troubleshooting.

---

## Usage

### Mock exam

1. Select **Mock Exam 1** on the landing page.
2. Wait for the prep banner to finish (workspace + namespace cleanup).
3. Solve tasks in the terminal — namespace is pre-set to `exam-qN`.
4. Edit course files under `/opt/course/pN/` (writable).
5. **End Exam** → review mode with auto-scoring from cluster state.

### Practice modules

1. Select a practice module (Core Concepts, Services, etc.).
2. Terminal uses `default` namespace unless the question has a scenario manifest.
3. **Check Answer** validates commands against the solution.
4. Some questions pre-seed cluster state (e.g. Observability Q4, Services Q9).

---

## Project Structure

```
ckad-simulator/
├── docker-compose.yml           # kind-init + backend
├── docker/                      # Dockerfiles, kind-config, bashrc
├── scripts/
│   ├── init-cluster.sh          # kind create + ingress + image pre-pull
│   ├── reset-question.sh        # reset single question scenario
│   └── validate-scenarios.js    # npm run validate:scenarios
├── exams/
│   ├── mock/1/
│   │   ├── exam.json, answer.json
│   │   ├── scenarios/q1..q17/   # kind setup.yaml + optional verify.sh
│   │   └── course/p1..p17/      # seed files → /opt/course at runtime
│   └── practice/{module}/       # practice JSON + optional scenarios/
├── src/
│   ├── sandbox/                 # kubectl, scenarios, evidence, verify
│   ├── ws/terminal.ts           # WebSocket PTY
│   └── client/                  # browser UI
├── sandbox/                     # runtime workspace only (gitignored)
└── docs/                        # dev/ session logs + archive/ history
```

---

## Adding Exams

Exams use JSON under `exams/mock/` or `exams/practice/` (see `exams/manifest.json`).

### Mock exam scenario

```
exams/mock/1/scenarios/q5/setup.yaml    # applied on first visit to Q5
exams/mock/1/scenarios/q5/verify.sh     # optional — used in review auto-score
```

Namespace must be `exam-q{N}` in manifests. Run `npm run validate:scenarios` after changes.

### Course files

Place seed files in `exams/mock/1/course/pN/`. They are copied to a writable workspace when the exam starts.

---

## Docs

- [`docs/dev/`](docs/dev/) — per-session development logs.
- [`docs/archive/`](docs/archive/) — completed kind-migration plan and early analysis, kept for reference. Final status: [14-migration-complete.md](docs/archive/kind-migration/14-migration-complete.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express, ws |
| Terminal | node-pty, xterm.js |
| Cluster | kind v0.24, Kubernetes v1.32.3 |
| Shell | bash, kubectl, helm, vim, jq, yq |
| Frontend | TypeScript → vanilla JS, marked.js |

---

## FAQ

**Does this affect my local Kubernetes clusters?**  
No. The simulator uses its own kind cluster inside Docker with an isolated kubeconfig.

**Can I run without Docker?**  
Yes, with a local kind cluster and `SANDBOX_MODE=kind`, but Docker Compose is the supported path.

**Why is `control-plane` outside the Compose group?**  
kind creates cluster containers via the Docker socket, not as Compose services.

**Exam files read-only error on `/opt/course`?**  
Rebuild and restart (`make up`). Course files are copied to a writable sandbox path on exam start.
