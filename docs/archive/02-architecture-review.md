# 02 — Architecture Review

> **Last updated:** July 2026  
> **Scope:** System design, component interactions, data flows, and design decision rationale.

---

## 1. System Overview

CKAD Simulator is a **single-process local web application** with three major layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER (Client)                        │
│   index.html + app.js + style.css                           │
│   xterm.js terminal  │  Markdown question panel  │  UI/UX   │
└────────────┬──────────────────────────┬────────────────────-┘
             │  WebSocket /ws           │  REST HTTP /api/*
             ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js)                         │
│   server.js — Express + ws + node-pty                       │
│   ├── Static file serving (public/)                         │
│   ├── Exam content parsing (exams/*.md)                     │
│   ├── Sandbox reset & session management                    │
│   ├── Evidence collection (for scoring)                     │
│   └── PTY lifecycle management                              │
└────────────────────────┬────────────────────────────────────┘
                         │  spawn bash process
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 SANDBOX (Bash Process)                       │
│   sandbox/.bashrc — environment + security                  │
│   sandbox/bin/kubectl — simulation wrapper                  │
│   sandbox/bin/k8s-lib.sh — state management                 │
│   sandbox/etc/kubernetes/ — filesystem-as-database          │
│   sandbox/opt/course/ — exam task files                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Deep Dive

### 2.1 `server.js` — The Application Core

**Role:** Single Node.js process that serves everything — static files, REST API, WebSocket, and PTY management.

**Key responsibilities:**

| Responsibility | Implementation |
|---------------|----------------|
| Static file serving | `express.static('public/')` |
| Exam discovery | Scans `exams/` directory for `exam.md` and `examN.md` patterns |
| Markdown parsing | Custom `parseFrontmatter`, `parseQuestions`, `parseAnswers` functions |
| PTY management | `node-pty` — one PTY per question index, stored in a `Map` |
| WebSocket multiplexing | Each WS message carries `questionId`; server routes to correct PTY |
| Command capture | Server intercepts WS input and appends to `.bash_history_qN` files |
| Session evidence | Collects history files, applied YAMLs, and course files for scoring |
| Sandbox reset | Cleans state directories, resets namespace/context files |

**Markdown parsing design:**

The server parses Markdown with regex rather than a full AST parser. This is a pragmatic choice for the custom frontmatter format:

```
title: CKAD Mock Exam 1
duration: 120
pass_percentage: 66
---
# Question 1 | Liveness Probe
weight: 7%
context: ssh ckad9043
...
```

Parsing is stateful (iterates lines), handles multi-line question bodies, and extracts code blocks for the "copy" feature in the UI.

**PTY lifecycle:**

```
Client connects WS
  → server creates PTY for questionId=0 if not exists
  → PTY env: HOME=sandbox/, PATH=sandbox/bin:$PATH, KUBECONFIG=/dev/null
  → PTY output forwarded to client via WS
  → Client input forwarded to PTY via WS
  → PTY stdout/stderr → WS → xterm.js render

Client navigates to Q2
  → PTY for questionId=1 created (or resumed if exists)
  → Each question has its own persistent bash session
```

This design means each question has an independent bash history and working directory — matching real exam behavior where each SSH jump host is independent.

### 2.2 `public/app.js` — The Frontend State Machine

**Three screens, one file:**

```
landing → exam → review
   ↑                ↓
   └─── restart ────┘
```

**Landing screen:**
- Fetches `/api/exams` on load
- Renders exam cards grouped by `mock` and `practice`
- Triggers `POST /api/sandbox/reset` on exam start

**Exam screen (Mock mode):**
- Timer (countdown from `duration` minutes)
- Color change at 15 min remaining (yellow) and 5 min (red)
- Question navigation (numbered buttons + prev/next)
- Flag system (per-question bookmarking)
- Notepad (shared textarea, persisted in memory)
- Terminal panel (xterm.js instance per question)
- "End Exam" → transitions to Review

**Exam screen (Practice mode):**
- No timer, no flag buttons
- "Check Answer" per question (collects evidence, scores against answer.md)
- "Finish Practice" → transitions to Practice Summary

**Review screen (Mock):**
- Lists all questions with scoring criteria checkboxes (`- [ ]` from answer.md)
- Auto-score button: heuristically checks history and files against criteria
- Weighted score calculation: `Σ (weight_i × checked_criteria_i / total_criteria_i)`

**Auto-scoring engine (`scoreOneCriterion`):**

The engine uses a pattern-based approach:
1. Parses the criterion text for K8s resource types, names, and actions
2. Checks bash history for matching commands
3. Checks `applied/` for matching YAML content
4. Returns a confidence-based boolean

**Practice scoring engine (`commandMatches` / `intentMatchesHistory`):**

More sophisticated than mock auto-score:
1. Normalizes kubectl aliases (`k` → `kubectl`, `kgp` → `kubectl get pods`, etc.)
2. Handles OR paths (`# or` blocks in answer.md)
3. Handles "Alternatively" sections
4. Matches by intent (action + resource type + name) rather than exact string

### 2.3 Sandbox Layer

**The sandbox is a filesystem-and-process isolation system** implemented entirely in bash, without containers or VMs.

**Isolation layers:**

| Layer | Mechanism | Strength |
|-------|-----------|----------|
| Home directory | `HOME=sandbox/` env override | Medium |
| Filesystem paths | `translate_path()` in `.bashrc` redirects `/etc/kubernetes`, `/opt`, `/tmp` to sandbox | Medium |
| Directory traversal | `cd` override checks `realpath` against sandbox root | Medium |
| Kubernetes writes | `KUBECONFIG=/dev/null` — no real cluster writes | High |
| Binary interception | `sandbox/bin/` first in `PATH` — all tool calls go through wrappers | High |
| Network isolation | None — `curl`/`wget` not intercepted | Low |

**Why not Docker?** The current design avoids Docker to minimize setup friction (`npm install && node server.js` is sufficient). Docker would add 1-2 GB of image size and require Docker Desktop. This is a valid trade-off for a personal tool but becomes a limitation for open-source distribution.

### 2.4 `sandbox/bin/kubectl` — The Simulation Engine

The kubectl wrapper is the most complex component (~809 lines). It handles:

**Read operations (simulated with fixtures):**
- `get pods/deployments/services` → reads `mock/<namespace>/<resource>.txt`
- `describe` → reads `mock/<namespace>/pods.d/<name>` or generates generic output
- `logs` → reads `session/ns/<ns>/pods.d/<name>/logs`

**Write operations (session state):**
- `run` → creates `session/ns/<ns>/pods.d/<name>` files (status, labels, yaml, logs)
- `create namespace` → creates `session/ns/<ns>/` directory
- `apply -f` → copies YAML to `applied/`, calls `register_resource_from_yaml`
- `delete` → removes session files
- `set image` → updates pod image field in session files

**Pass-through to real kubectl:**
- `kubectl explain <resource>` — real binary (if installed)
- `kubectl <resource> --help` — real binary (if installed)
- `kubectl version` — mocked

**Dual namespace model:**

```
┌─────────────────┬─────────────────────────────────────────┐
│ Mock namespaces │ Pre-loaded from mock/ fixture files.    │
│ (read-only)     │ Set up on exam reset. Reflect exam      │
│                 │ scenario starting state.                │
├─────────────────┼─────────────────────────────────────────┤
│ Session NS      │ Created by user commands during exam.   │
│ (read-write)    │ Stored in session/ns/<name>/            │
│                 │ Merged with mock data on get commands.  │
└─────────────────┴─────────────────────────────────────────┘
```

### 2.5 `sandbox/bin/k8s-lib.sh` — State Management Library

Sourced by `kubectl`, provides:
- `get_session_state <ns> <resource>` — reads session directory
- `merge_mock_and_session <ns> <resource>` — combines fixture + user-created resources
- `register_resource_from_yaml <file>` — YAML → session state
- `gen_dryrun_yaml <resource> <name> <flags>` — generates valid K8s YAML without a cluster connection
- `register_pod <ns> <name> <image> <labels>` — creates full pod state directory

---

## 3. Data Flow: Mock Exam Session

```
1. User clicks "Start CKAD Mock Exam 1"
   → POST /api/sandbox/reset
     → Reads exam1.md, extracts namespace list
     → Writes mock-namespaces.txt
     → Clears applied/, session/, history files
     → Resets namespace=default, context=kubernetes-admin@kubernetes
   → GET /api/exams/exam1 → returns parsed questions
   → WS connect → PTY created for Q0

2. User reads Q1 ("Fix liveness probe on pod in namespace pluto")
   → Switches to terminal
   → Types: kubectl config set-context --current --namespace pluto
     → kubectl wrapper writes to etc/kubernetes/namespace
   → Types: kubectl get pods
     → kubectl reads mock/pluto/pods.txt → outputs to terminal
   → Types: kubectl edit pod <name> OR kubectl apply -f fix.yaml
     → If apply: YAML copied to applied/, resource registered in session

3. User clicks "End Exam"
   → GET /api/session/evidence
     → Returns: { history: {...}, applied: [...], courseFiles: [...] }
   → Review screen renders with criteria checkboxes
   → "Auto-Score" → scoreOneCriterion() for each criterion
```

---

## 4. Data Flow: Practice Module Session

```
1. User clicks "core_concepts"
   → POST /api/sandbox/reset (no mock namespaces set)
   → GET /api/exams/core_concepts → questions

2. User works through questions freely
   → Session-only namespace (user creates everything from scratch)
   → No fixture namespaces pre-loaded

3. User clicks "Check Answer" on Q3
   → GET /api/session/evidence
   → Frontend parses answer.md for Q3
   → commandMatches() checks each answer bash block against history
   → Marks criteria as pass/fail
```

---

## 5. Design Decisions and Rationale

### Decision 1: No containerization for sandbox

**Chosen:** Bash process with PATH override and filesystem translation  
**Alternative:** Docker container per exam session  
**Rationale:** Zero additional dependencies, instant startup, works on macOS/Linux without Docker Desktop. Acceptable for a local personal tool.  
**Trade-off:** Network commands (`curl`, `wget`) are not sandboxed. Users can technically reach the internet from the terminal.

### Decision 2: Filesystem as database for K8s state

**Chosen:** Plain text files in `sandbox/etc/kubernetes/session/`  
**Alternative:** SQLite or in-memory object store in `server.js`  
**Rationale:** Shell scripts can read/write state natively without IPC. Exam reset is a simple `rm -rf`. Debugging is trivial (just `cat` files).  
**Trade-off:** No transactions, no schema validation. Complex resources (like Ingress with multiple rules) are hard to store faithfully.

### Decision 3: One PTY per question (not one per exam)

**Chosen:** Separate bash session per question index  
**Alternative:** Single shared bash session, or one per namespace  
**Rationale:** Matches real CKAD behavior (each task isolated on different cluster/context). Prevents accidental cross-question state pollution.  
**Trade-off:** More PTY processes. On a slow machine with 17 questions all opened, 17 bash processes would exist simultaneously.

### Decision 4: Markdown as content format

**Chosen:** Markdown with custom frontmatter for all exam content  
**Alternative:** JSON/YAML structured content, or a database  
**Rationale:** Human-readable, Git-friendly, easy to edit without tooling. The `convert-ckad-exercises.js` script shows it can be generated programmatically too.  
**Trade-off:** Parsing is custom regex-based, fragile to format deviations. No validation schema.

### Decision 5: Vanilla JS frontend

**Chosen:** No framework — plain DOM manipulation  
**Alternative:** React, Vue, or Svelte  
**Rationale:** No build step, no framework updates to manage, full control. xterm.js and marked.js are the only CDN dependencies.  
**Trade-off:** As the UI grows, `app.js` at 1544 lines becomes harder to maintain. No component isolation or state management patterns.

---

## 6. Architecture Strengths

- **Minimal dependency surface** — only 3 npm packages, nothing to "break" on updates
- **Fast startup** — `node server.js` is running in under 1 second
- **Real terminal feel** — node-pty + xterm.js is industry-standard for browser terminals
- **Layered isolation** — even without containers, multiple barriers prevent accidental real cluster writes
- **Self-contained content** — exam questions and answers live in the repo, fully offline

---

## 7. Architecture Weaknesses

- **Monolithic `app.js`** — 1544 lines of mixed concerns (UI, scoring, networking, terminal lifecycle)
- **Monolithic `server.js`** — exam parsing, API routing, PTY management all in one file
- **No persistent session** — refreshing the browser loses all progress
- **PTY leaks on disconnect** — if the client disconnects without a clean close, PTY processes may linger
- **No request validation** — API endpoints don't validate input (e.g., exam ID traversal risk)
- **No error boundaries** — a JavaScript error in the scoring loop can crash the entire review screen
- **Single-user only** — PTY map is global; two browser tabs would interfere

---

## 8. Proposed Architecture (Future)

For the open-source multi-user vision, the architecture should evolve toward:

```
┌─────────────────────────────────────────┐
│           Client (Browser)               │
│   React/Svelte SPA with component tree   │
│   xterm.js, marked, zustand/stores       │
└────────────┬─────────────────────────────┘
             │ WebSocket + REST
             ▼
┌─────────────────────────────────────────┐
│      API Server (Node.js + TS)           │
│   Modular routers (exams, sessions, ws)  │
│   Session management (JWT or cookie)     │
│   Content loader (exam registry)         │
└────────────┬─────────────────────────────┘
             │ per-session Docker container
             ▼
┌─────────────────────────────────────────┐
│   Sandbox Container (Alpine + bash)      │
│   Pre-installed: kubectl stub, vim, etc. │
│   Real kubeconfig pointing to kind/k3s   │
│   Lifecycle: start on session, TTL kill  │
└─────────────────────────────────────────┘
             │ optional
             ▼
┌─────────────────────────────────────────┐
│   Real K8s Cluster (kind / k3s)          │
│   One namespace per user session         │
│   Cleanup job after session ends         │
└─────────────────────────────────────────┘
```

This evolution is covered in detail in [08 — Future Roadmap](./08-future-roadmap.md).
