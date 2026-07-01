# 07 — Onboarding & Developer Setup Guide

> **Last updated:** July 2026  
> **Audience:** New contributors, returning developers after a break, and anyone setting up the project for the first time.

---

## 1. Project Orientation

Before writing a single line of code, understand the two fundamental things this project does:

1. **It serves a browser-based terminal** — users type real bash commands into a simulated Kubernetes environment without needing a real cluster.
2. **It manages exam content** — Markdown files define questions, scoring criteria, and solutions that drive the entire UI.

Every change you make will touch one of these two systems. Keep that mental model.

---

## 2. Prerequisites

### 2.1 Required

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 (v20 LTS recommended) | `brew install node` or [nodejs.org](https://nodejs.org) |
| npm | Comes with Node | — |
| bash | ≥ 4.x | macOS: `brew install bash` (system bash is 3.2 — too old) |
| Git | Any | `brew install git` |

**macOS-specific:** Xcode Command Line Tools are required for `node-pty` native compilation:
```bash
xcode-select --install
```

### 2.2 Optional (enhances the simulator)

| Tool | Why |
|------|-----|
| `kubectl` | Enables `kubectl explain` and `kubectl --help` pass-through |
| `helm` | Enables `helm --help` pass-through |
| `docker` or `podman` | Enables `docker/podman --help` pass-through |

---

## 3. First-Time Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd ckad-simulator

# 2. Install Node dependencies (builds node-pty native bindings)
npm install

# 3. Start the server
node server.js

# 4. Open in browser
open http://localhost:3000
```

You should see the landing page with exam cards. If you see a blank page, check the terminal for Node errors.

### Common Setup Issues

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `node-pty` build fails | Missing Xcode CLT | `xcode-select --install` |
| `EADDRINUSE` on port 3000 | Another process using the port | `lsof -i :3000` then kill the PID, or `PORT=3001 node server.js` |
| Terminal renders but commands fail | Wrong bash version | `which bash && bash --version` — must be bash 4+ |
| `kubectl get` returns nothing | Exam not reset | Click "Start Exam" which calls `/api/sandbox/reset` |
| `marked is not defined` | CDN unreachable | Check internet connection, or vendor marked.js locally |

---

## 4. Project Structure Mental Map

```
ckad-simulator/
│
│   ← SERVER LAYER ─────────────────────────────────────────
├── server.js              You will touch this for:
│                          - Adding new API endpoints
│                          - Changing exam discovery logic
│                          - Modifying scoring data collection
│                          - WebSocket protocol changes
│
│   ← CLIENT LAYER ──────────────────────────────────────────
├── public/
│   ├── index.html         Rarely touched — structural HTML only
│   ├── app.js             You will touch this for:
│   │                      - UI changes (new buttons, panels)
│   │                      - Scoring algorithm changes
│   │                      - New exam modes
│   └── style.css          You will touch this for:
│                          - Styling changes
│
│   ← EXAM CONTENT ──────────────────────────────────────────
├── exams/
│   ├── exam1.md           You will touch this to:
│   │                      - Add/edit mock exam questions
│   ├── answer1.md         - Add/edit scoring criteria + solutions
│   └── <module>/
│       ├── exam.md        - Add/edit practice questions
│       └── answer.md      - Add/edit practice answers
│
│   ← SANDBOX SIMULATION ──────────────────────────────────
└── sandbox/
    ├── .bashrc            You will touch this for:
    │                      - Shell environment changes
    │                      - New command aliases
    │                      - Path translation rules
    ├── bin/
    │   ├── kubectl        You will touch this for:
    │   │                  - New kubectl subcommand support
    │   └── k8s-lib.sh     - State management logic
    │                      - Dry-run YAML generation
    └── etc/kubernetes/
        └── mock/          You will touch this to:
            └── <ns>/      - Add fixture files for exam scenarios
```

---

## 5. Understanding the Exam Flow (Critical Reading)

### 5.1 How Exam Content is Discovered

On startup (or first request), `server.js`:
1. Scans `exams/` for files matching `exam{N}.md` (mock exams) and `*/exam.md` (practice modules)
2. Parses frontmatter (title, duration, pass_percentage)
3. Exposes exam list via `GET /api/exams`

**To add a new practice module:** Create `exams/<slug>/exam.md` + `answer.md`. The server picks it up automatically.

### 5.2 How the Sandbox is Prepared

When a user starts an exam, `POST /api/sandbox/reset` is called. This:
1. Reads the exam's question list
2. Extracts namespace names mentioned in `context:` fields
3. Writes them to `sandbox/etc/kubernetes/session/mock-namespaces.txt`
4. Clears all runtime state (`applied/`, `session/`, history files)

**Critical:** If you add a new question with a `context: ssh <hostname>` field, the hostname becomes the expected namespace. A fixture directory `sandbox/etc/kubernetes/mock/<hostname>/` must exist for `kubectl get` to return data in that namespace.

### 5.3 How kubectl Simulation Works

```bash
# User types: kubectl get pods -n pluto
# ↓ Routes to sandbox/bin/kubectl
# ↓ Reads current namespace from sandbox/etc/kubernetes/namespace
# ↓ Checks if "pluto" is in mock-namespaces.txt
# ↓ YES → reads sandbox/etc/kubernetes/mock/pluto/pods.txt
# ↓ ALSO checks session/ns/pluto/ for any user-created pods
# ↓ Merges and outputs the combined list
```

**If `mock/pluto/pods.txt` doesn't exist:** The command returns an empty list, which may confuse users trying to work on the question.

### 5.4 How Scoring Works

**Mock exam auto-score:**
1. After "End Exam", the client calls `GET /api/session/evidence`
2. Server collects: bash history per question, applied YAML files, course files
3. Client calls `scoreOneCriterion(criterion, evidence)` for each checkbox
4. Heuristic matching: looks for resource names, kubectl actions, and YAML content

**Practice answer checking:**
1. User clicks "Check Answer"
2. Evidence collected
3. `commandMatches()` normalizes kubectl aliases and checks history
4. Each bash code block in `answer.md` becomes a "required command pattern"

---

## 6. Development Workflow

### 6.1 Making Changes to the Server

```bash
# During development, use nodemon-style watching:
node --watch server.js

# Or install nodemon globally:
npm install -g nodemon
nodemon server.js
```

Server changes take effect on restart. Browser doesn't need a hard refresh for API changes (JS fetches the data).

### 6.2 Making Changes to the Frontend

The frontend is served as static files from `public/`. Edit and **hard refresh** the browser (`Cmd+Shift+R` / `Ctrl+Shift+R`).

No build step is needed.

### 6.3 Making Changes to the Sandbox

Shell scripts are read fresh each time a command runs (kubectl is exec'd by bash each time). Changes to `sandbox/bin/kubectl` or `k8s-lib.sh` take effect **immediately** — no server restart needed.

Test sandbox changes directly in the terminal:

```bash
# Open a test bash session with sandbox env:
HOME=$(pwd)/sandbox \
  PATH=$(pwd)/sandbox/bin:$PATH \
  KUBECONFIG=/dev/null \
  bash --rcfile sandbox/.bashrc

# Now run kubectl commands directly:
kubectl get pods -n pluto
```

### 6.4 Making Changes to Exam Content

Edit the `.md` files in `exams/`. The server re-reads them on the next API request — no restart needed.

**To test your changes:**
1. Save the file
2. Hard-refresh the browser
3. Start the exam again (to trigger sandbox reset)

---

## 7. Adding a New Practice Module (Step-by-Step)

```bash
# 1. Create the directory
mkdir exams/security_contexts

# 2. Create exam.md
cat > exams/security_contexts/exam.md << 'EOF'
---
title: Security Contexts
duration: 60
pass_percentage: 70
topics: [security, pods]
---

# Question 1 | Non-Root Container
weight: 25%

Create a Pod named `secure-pod` in namespace `default` that:
- Uses image `nginx:1.25`
- Runs as user ID 1000
- Runs as group ID 3000
- Has `allowPrivilegeEscalation: false`

EOF

# 3. Create answer.md
cat > exams/security_contexts/answer.md << 'EOF'
# Answer 1

- [ ] Pod named `secure-pod` exists and is Running
- [ ] `runAsUser: 1000` set in securityContext
- [ ] `runAsGroup: 3000` set in securityContext
- [ ] `allowPrivilegeEscalation: false` set

**Solution:**
```bash
kubectl apply -f - <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  containers:
  - name: nginx
    image: nginx:1.25
    securityContext:
      runAsUser: 1000
      runAsGroup: 3000
      allowPrivilegeEscalation: false
YAML
```

EOF

# 4. Verify it appears in the simulator
curl http://localhost:3000/api/exams | jq '.[] | select(.id == "security_contexts")'
```

---

## 8. Adding a Mock Exam Fixture (Step-by-Step)

```bash
# 1. Create the namespace fixture directory
mkdir -p sandbox/etc/kubernetes/mock/my-namespace

# 2. Create pods.txt (copy format from existing fixtures)
cat > sandbox/etc/kubernetes/mock/my-namespace/pods.txt << 'EOF'
NAME                    READY   STATUS    RESTARTS   AGE
my-app-7d8c9f-xyz12     1/1     Running   0          5d
EOF

# 3. Optionally add more resources
cat > sandbox/etc/kubernetes/mock/my-namespace/deployments.txt << 'EOF'
NAME      READY   UP-TO-DATE   AVAILABLE   AGE
my-app    1/1     1            1           5d
EOF

# 4. Test it
HOME=$(pwd)/sandbox PATH=$(pwd)/sandbox/bin:$PATH KUBECONFIG=/dev/null bash --rcfile sandbox/.bashrc -c "kubectl get pods -n my-namespace"
```

**Required format:** The text files must exactly match real `kubectl get` output format (with headers). The simulator outputs them verbatim.

---

## 9. Running Tests

Manual verification is the primary workflow today:

```bash
npm start
# Verify landing page, start a mock exam, run kubectl commands in terminal
```

Automated test suite is planned — see `docs/08-future-roadmap.md`.

---

## 10. Code Review Checklist

Before submitting a PR, verify:

- [ ] Exam content: weights sum to 100% for mock exams
- [ ] Exam content: all `context: ssh <ns>` namespaces have fixture directories
- [ ] Exam content: all `opt/course/` file references have actual files
- [ ] Shell scripts: test manually with the bash sandbox env
- [ ] Server changes: test `POST /api/sandbox/reset` still works
- [ ] Frontend changes: hard-refresh and test both mock + practice modes
- [ ] No `console.log` debug statements left in production code

---

## 11. Useful Commands

```bash
# Start server
node server.js

# Test sandbox directly
HOME=$(pwd)/sandbox PATH=$(pwd)/sandbox/bin:$PATH KUBECONFIG=/dev/null bash --rcfile sandbox/.bashrc

# List all available exams
curl http://localhost:3000/api/exams | jq '.'

# Get a specific exam's questions
curl http://localhost:3000/api/exams/core_concepts | jq '.questions[0]'

# Get a specific exam's answers
curl http://localhost:3000/api/exams/core_concepts/answers | jq '.[0]'

# Reset sandbox
curl -X POST http://localhost:3000/api/sandbox/reset -H 'Content-Type: application/json' -d '{"examId":"exam1"}'

# View session evidence
curl http://localhost:3000/api/session/evidence | jq '.'

# Check which namespaces are in mock mode
cat sandbox/etc/kubernetes/session/mock-namespaces.txt

# Check what's been applied
ls -la sandbox/etc/kubernetes/applied/

# View bash history for question 3
cat sandbox/.bash_history_q2   # 0-indexed
```

---

## 12. Debugging Common Development Issues

### "Terminal shows nothing after typing"

1. Check WebSocket connection in browser DevTools (Network → WS)
2. Check if a PTY was created: look for Node process output like `PTY created for question 0`
3. Check if `bash --rcfile sandbox/.bashrc` works directly in your terminal

### "kubectl get returns wrong data"

1. Check `cat sandbox/etc/kubernetes/namespace` — which namespace is active?
2. Check `cat sandbox/etc/kubernetes/session/mock-namespaces.txt` — is the namespace listed?
3. Check if `sandbox/etc/kubernetes/mock/<namespace>/pods.txt` exists

### "Practice scoring shows wrong result"

1. Check the evidence: `curl http://localhost:3000/api/session/evidence`
2. Look at `history` field — are your commands recorded there?
3. Check `commandMatches()` in `app.js` — does it handle your specific command?

### "Exam doesn't appear in the list"

1. Check the file exists: `ls exams/<slug>/exam.md`
2. Check the frontmatter is valid YAML (title, duration fields present)
3. Check for parse errors in the Node terminal output

---

## 13. Key Files Quick Reference

| What you want to change | File to edit |
|------------------------|-------------|
| Add a new API endpoint | `server.js` |
| Change how exams are parsed | `server.js` → `parseQuestions()` |
| Change UI/layout | `public/index.html`, `public/style.css` |
| Change mock scoring logic | `public/app.js` → `scoreOneCriterion()` |
| Change practice scoring logic | `public/app.js` → `commandMatches()` |
| Add kubectl command support | `sandbox/bin/kubectl` |
| Add resource state management | `sandbox/bin/k8s-lib.sh` |
| Change shell environment | `sandbox/.bashrc` |
| Add exam questions | `exams/<module>/exam.md` |
| Add/fix scoring criteria | `exams/<module>/answer.md` |
| Add namespace fixtures | `sandbox/etc/kubernetes/mock/<ns>/` |
