# 05 — Improvement Areas

> **Last updated:** July 2026  
> **Scope:** Concrete bugs, refactoring opportunities, and quick wins — ordered by priority.

---

## Priority Legend

| Priority | Label | Meaning |
|----------|-------|---------|
| P0 | 🔴 Critical | Blocks open-source launch or causes incorrect behavior |
| P1 | 🟠 High | Significantly degrades UX or maintainability |
| P2 | 🟡 Medium | Important but deferrable |
| P3 | 🟢 Low | Nice to have / future consideration |

---

## Category 1: Bugs and Correctness

### [P0] Path Traversal in Exam API

**File:** `server.js`  
**Issue:** The `/api/exams/:id` and `/api/exams/:id/answers` endpoints construct file paths using the `:id` URL parameter without validation. A request like `/api/exams/../../package.json` would read arbitrary files.

**Fix:**
```javascript
// After resolving the file path:
const resolvedPath = path.resolve(examsDir, id, 'exam.md');
if (!resolvedPath.startsWith(path.resolve(examsDir))) {
  return res.status(400).json({ error: 'Invalid exam ID' });
}
```

---

### [P0] Mock Exam Weight Sum is 93%

**File:** `exams/exam1.md`  
**Issue:** The 17 question weights sum to 93%, not 100%. The review scoring display and pass threshold calculation are therefore mathematically incorrect.

**Fix:** Audit all question weights and adjust to sum to exactly 100. The missing 7% should be distributed proportionally or assigned to a specific question.

---

### [P0] SSH Implementation Conflict

**Files:** `sandbox/.bashrc`, `sandbox/bin/ssh`  
**Issue:** `.bashrc` defines an `ssh()` function (same-process, prompt-only change), but `sandbox/bin/ssh` is a real executable that spawns a new `exec bash` subshell. Since `sandbox/bin/` is first in `PATH`, `bin/ssh` takes precedence, creating a subshell in contradiction with the README.

**Fix (Option A):** Delete `sandbox/bin/ssh` and keep only the `.bashrc` function.  
**Fix (Option B):** Delete the `.bashrc` `ssh()` function and properly implement context switching in `bin/ssh` without `exec bash` (preserve the current session while only changing the prompt and context).

---

### [P1] kubectl apply Missing Resource Type Registration

**Files:** `sandbox/bin/k8s-lib.sh`  
**Issue:** `register_resource_from_yaml` only handles `Pod`, `Deployment`, and `Namespace` resources. Applying a `Service`, `ConfigMap`, `Secret`, `CronJob`, `Ingress`, `PersistentVolumeClaim`, or `Job` manifest will silently succeed (exit 0) but the resource will not appear in subsequent `kubectl get` calls.

**Fix:** Extend `register_resource_from_yaml` to handle at minimum:
- `Service` → `session/ns/<ns>/services/<name>`
- `ConfigMap` → `session/ns/<ns>/configmaps/<name>`
- `Secret` → `session/ns/<ns>/secrets/<name>`
- `CronJob` / `Job` → `session/ns/<ns>/cronjobs/<name>`, `jobs/<name>`

---

### [P1] helm Release State Not Persisted

**File:** `sandbox/bin/helm`  
**Issue:** `helm install` outputs a success message but writes no state. `helm list`, `helm status`, `helm upgrade`, and `helm uninstall` do not reflect installed releases.

**Fix:** Implement a minimal Helm state file at `sandbox/etc/helm/releases/<name>.json`:
```json
{
  "name": "myapp",
  "chart": "bitnami/nginx",
  "namespace": "default",
  "status": "deployed",
  "revision": 1,
  "deployed_at": "2026-07-02T01:00:00Z"
}
```
Then have `helm list` read these files.

---

### [P2] PTY Process Leak on Client Disconnect

**File:** `server.js`  
**Issue:** When a WebSocket client disconnects unexpectedly (browser crash, network loss), the PTY processes for all their open questions may not be cleaned up.

**Fix:** In the WebSocket `close` event handler, iterate all PTY instances for that client connection and call `pty.kill()`. Also add a heartbeat ping/pong to detect dead connections.

---

### [P2] `dev-null-kubeconfig` Unused Dead File

**File:** `sandbox/dev-null-kubeconfig`  
**Issue:** This file exists but is never referenced. The current approach uses `KUBECONFIG=/dev/null` as an environment variable, which is different.

**Fix:** Either:
- Delete the file, OR
- Use it: change `KUBECONFIG=/dev/null` to `KUBECONFIG=<path-to-sandbox>/dev-null-kubeconfig` for a more explicit and debuggable setup.

---

## Category 2: Missing Content (Fixtures)

### [P1] Missing Mock Exam Namespace Fixtures

**Location:** `sandbox/etc/kubernetes/mock/`  
**Issue:** The following namespaces are referenced in `exam1.md` but have no fixture files:

| Namespace | Question | What's Needed |
|-----------|---------|----------------|
| `sun` | Q2 | pods.txt, deployments.txt (solar-front + solar-back-api) |
| `moon` | Q4 | No pre-existing resources needed (CronJob creation task) |
| `mercury` | Q6 | pods.txt, configmaps.txt |
| `venus` | Q8 | pods.txt (multi-container starting state) |
| `jupiter` | Q9 | pods.txt, pvc.txt |
| `io` | Q13 | pods.txt (security-context-demo pod) |
| `europa` | Q14 | helm release state |
| `ganymede` | Q16 | pods.txt (resource limits demo) |

Each fixture file should mirror actual `kubectl get` output format for realism.

---

### [P1] Missing `opt/course/` Task Files

**Location:** `sandbox/opt/course/`  
**Issue:** `exam1.md` references the following files that don't exist in the repository:

| File | Referenced In | Description |
|------|-------------|-------------|
| `p2/sunny_status_command.sh` | Q2 | Script to verify service connectivity |
| `p3/ticket-654.txt` | Q3 | Troubleshooting task description |
| `p3/ticket-778.txt` | Q3 | Second troubleshooting task description |
| `p5/network-policy.yaml` | Q5 | Starting NetworkPolicy YAML |
| `p9/pvc.yaml` | Q9 | PVC template to work from |

These files should be created as realistic exam artifacts — they are part of the exam scenario setup.

---

## Category 3: Code Refactoring

### [P1] Split `server.js` into Modules

**Current:** Single 627-line file.  
**Proposed structure:**

```
src/
├── server.js              ← entry point, starts server
├── routes/
│   ├── exams.js           ← GET /api/exams, GET /api/exams/:id
│   ├── session.js         ← POST /api/sandbox/reset, GET /api/session/evidence
│   └── health.js          ← GET /health (new)
├── ws/
│   └── terminal.js        ← WebSocket + PTY lifecycle
├── exam/
│   ├── parser.js          ← parseFrontmatter, parseQuestions, parseAnswers
│   └── registry.js        ← exam discovery, exam list cache
└── sandbox/
    └── reset.js           ← sandbox reset logic
```

---

### [P1] Split `public/app.js` into ES Modules

**Current:** 1544-line single file with global state.  
**Proposed structure (no framework needed):**

```
public/
├── app.js                 ← entry, imports and wires everything
├── modules/
│   ├── state.js           ← centralized state object
│   ├── terminal.js        ← xterm.js lifecycle, WS connection
│   ├── timer.js           ← countdown, color changes, end trigger
│   ├── scoring/
│   │   ├── mock-scorer.js ← scoreOneCriterion, weighted total
│   │   └── practice-scorer.js ← commandMatches, intentMatchesHistory
│   ├── screens/
│   │   ├── landing.js     ← exam card rendering
│   │   ├── exam.js        ← question panel, navigation, flags
│   │   └── review.js      ← criteria checkboxes, score display
│   └── api.js             ← fetch wrappers for all /api/* calls
```

Use `<script type="module">` in `index.html` — no bundler required.

---

### [P2] Migrate to TypeScript

Both `server.js` and the frontend modules would benefit from TypeScript for:
- Type-safe exam question/answer schemas
- Typed WebSocket message protocol
- Autocomplete and refactoring support

**Migration path:**
1. Add `tsconfig.json` with `allowJs: true, checkJs: true` — zero breaking changes, immediate type error detection.
2. Rename files to `.ts` one by one.
3. Add type definitions for exam schemas (`ExamQuestion`, `ScoringCriterion`, etc.).

---

### [P2] Normalize kubectl Simulation Completeness

**Current coverage:**

| Resource | get | describe | create | apply | delete | edit |
|----------|-----|----------|--------|-------|--------|------|
| Pod | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ |
| Deployment | ✅ | 🟡 | ✅ | 🟡 | ✅ | ❌ |
| Service | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ |
| ConfigMap | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Secret | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| CronJob | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Ingress | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ |
| RBAC | 🟡 | ❌ | ✅ | ❌ | ❌ | ❌ |
| PVC/PV | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Minimum viable completion target:** All resources with full `get/describe/create/apply/delete` coverage — 80 of the 45 CKAD exam scenarios require these operations.

---

### [P3] Replace Custom Markdown Parser with a Formal Schema

**Current:** Regex-based line-by-line parsing in `server.js`.  
**Risk:** Fragile to whitespace, special characters, or format drift between exam files.

**Proposed:** Define a JSON schema for exam content and validate on load:

```json
{
  "title": "CKAD Mock Exam 1",
  "duration": 120,
  "passPercentage": 66,
  "questions": [
    {
      "id": 1,
      "title": "Liveness Probe",
      "weight": 7,
      "context": "ssh ckad9043",
      "body": "...",
      "criteria": ["Pod has liveness probe", "Probe uses httpGet"],
      "solution": "kubectl edit pod ..."
    }
  ]
}
```

Keep Markdown for the `body` field (human-readable source), but serialize to JSON for the API.

---

## Category 4: Developer Experience

### [P1] Add `npm test` Script

**Current:** No `test` script in `package.json`.  
**Fix:**
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:shell": "bats scripts/tests/",
  "lint": "eslint src/ public/",
  "lint:shell": "shellcheck sandbox/bin/kubectl sandbox/bin/k8s-lib.sh sandbox/.bashrc"
}
```

---

### [P1] Add a `Dockerfile` for Zero-Friction Setup

**Current:** Requires Node.js, npm, and Xcode CLT to be pre-installed.  
**Proposed:**

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache bash python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

With a `docker-compose.yml` for volume mounts (so exam content is editable without rebuild):

```yaml
services:
  simulator:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./exams:/app/exams
      - ./sandbox:/app/sandbox
```

---

### [P2] Add Bash Version Check at Server Startup

```javascript
// In server.js startup:
const { execSync } = require('child_process');
const bashVersion = execSync('bash --version').toString();
const match = bashVersion.match(/version (\d+)/);
if (match && parseInt(match[1]) < 4) {
  console.error('ERROR: bash 4+ required. macOS users: brew install bash');
  process.exit(1);
}
```

---

### [P2] Add `LICENSE` File

Without a license, the repository is legally **All Rights Reserved** even if public on GitHub. For an open-source educational resource, choose:

- **MIT** — most permissive, recommended for educational tools
- **Apache 2.0** — adds patent grant, good for tools
- **GPL 3.0** — copyleft, ensures derivative works stay open

**Recommendation: MIT License** — encourages adoption and contribution.

---

### [P2] Add `CONTRIBUTING.md`

Essential for open-source onboarding. Should cover:
- How to add a new practice module
- How to add mock exam fixture files
- Code style and PR process
- Testing requirements before submitting a PR

---

## Quick Win Checklist

Items that can be done in < 30 minutes each:

- [ ] Add `LICENSE` file (MIT)
- [ ] Add path traversal guard to `/api/exams/:id`
- [ ] Fix weight sum in `exam1.md` (adjust weights to sum to 100%)
- [ ] Add `npm test` script to `package.json`
- [ ] Add `node --watch server.js` as `npm run dev`
- [ ] Add `.eslintrc.json` and `.prettierrc`
- [ ] Add `.editorconfig`
- [ ] Delete `sandbox/dev-null-kubeconfig` (or use it properly)
- [ ] Move `test-core-concepts-sandbox.sh` to `scripts/tests/` and commit it
- [ ] Add `CHANGELOG.md` with initial entry for v1.0
