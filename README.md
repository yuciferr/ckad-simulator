# CKAD Simulator

A local, browser-based practice environment for the **Certified Kubernetes Application Developer (CKAD)** exam. It replicates the PSI exam interface with a fully interactive terminal, realistic questions, per-question shell history, and self-scoring review mode — all running entirely on your machine with **zero impact on your local Kubernetes clusters or filesystem**.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Sandbox Safety](#sandbox-safety)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Adding Custom Exams](#adding-custom-exams)
- [Project Structure](#project-structure)
- [FAQ](#faq)

---

## Features

| Feature | Details |
|---|---|
| **PSI-like UI** | Split pane: question panel on the left, terminal on the right |
| **Real Interactive Terminal** | Full PTY (node-pty + xterm.js) — vim, history, tab completion all work |
| **Per-question shell sessions** | Each question has its own independent terminal history |
| **Sandboxed environment** | Shell is isolated — your local files, clusters and home directory are untouched |
| **kubectl / helm / docker** | Available as smart wrappers (read-only/dry-run uses real binary; mutations are simulated) |
| **ssh simulation** | `ssh ckad9043` changes the prompt — no real connection, no subshell |
| **Click-to-copy** | Click any `code` element in a question to copy it to clipboard |
| **Timer** | Configurable countdown with colour warnings at 15 min and 5 min |
| **Navigation & flagging** | Jump to any question, flag for later review |
| **Notepad** | Built-in scratch pad per exam session |
| **Self-scoring review** | After the exam, tick answer criteria checkboxes and see your weighted score |
| **Auto-detect exams** | Drop new `examN.md` / `answerN.md` files into `/exams` — they appear on reload |

---

## How It Works

```
Browser (xterm.js)  ←──WebSocket──→  Node.js server (node-pty)
                                            │
                                    spawns bash inside
                                    sandbox/ directory
```

1. The browser opens a WebSocket connection to the local server.
2. The server spawns a **bash shell inside the `sandbox/` directory** for each question's terminal.
3. All input/output is streamed in real-time via WebSocket.
4. Exam questions are read from Markdown files in `exams/` and rendered in the left panel.

---

## Sandbox Safety

> **Your local filesystem, Kubernetes clusters, and home directory are completely isolated from the simulator.**

This is enforced at multiple layers:

### Filesystem isolation

| Mechanism | Effect |
|---|---|
| `HOME` set to `sandbox/` | Shell starts and stays inside the sandbox directory |
| `cd` override | Any attempt to `cd` outside `sandbox/` is blocked with a clear error message |
| Path translation | Commands like `cat /opt/course/p1/foo.yaml` are transparently rewritten to `sandbox/opt/course/p1/foo.yaml` |
| `vim`, `cp`, `mv`, `rm` | All transparently operate within the sandbox |

### Kubernetes isolation

| Mechanism | Effect |
|---|---|
| `KUBECONFIG=/dev/null` | Passed to the shell environment — kubectl cannot reach any real cluster |
| `kubectl` wrapper | Mutating commands (`apply`, `create`, `delete`, etc.) print realistic output but make no real API calls |
| Safe passthrough | `kubectl explain`, `--help`, `--dry-run=client -o yaml` use the real local binary (read-only, cluster-unreachable) |

### SSH & context simulation

| Command | What actually happens |
|---|---|
| `ssh ckad9043` | Changes the shell prompt to `student@ckad9043` — stays in the same shell, no new process |
| `exit` | Restores the original prompt — "Connection to ckad9043 closed." |
| `kubectx <name>` | Writes the context name to a file in `sandbox/etc/kubernetes/` |
| `kubens <ns>` | Writes the namespace to a file in `sandbox/etc/kubernetes/` |

No real SSH connections are ever made. No real context switches happen.

---

## Requirements

### Docker + kind (recommended)

- **Docker Engine / Docker Desktop** 24+
- **Docker Compose** v2
- **8 GB RAM** recommended (kind uses ~1 GB)

### Local Node.js (alternative)

- **Node.js** ≥ 18 (v20 LTS or v22 recommended)
- **macOS** or **Linux** (node-pty requires native compilation)
- **kubectl** 1.32+ and a **running kind cluster**
- **Xcode Command Line Tools** *(macOS only)*:
  ```bash
  xcode-select --install
  ```

---

## Installation

### Quick start — Docker + kind (real Kubernetes)

```bash
git clone <repo-url> ckad-simulator
cd ckad-simulator

# Apple Silicon
TARGETARCH=arm64 make up

# Intel / Linux
make up

open http://localhost:3000
```

First run creates a kind cluster (~60s). See [docs/kind-migration/08-quick-start.md](docs/kind-migration/08-quick-start.md).

```bash
make down          # stop containers
make reset-q Q=3   # reset question 3 namespace
make cluster       # kubectl get nodes
```

### Local development — Node.js

```bash
# 1. Clone the repository
git clone <repo-url> ckad-simulator
cd ckad-simulator

# 2. Install dependencies (compiles node-pty natively)
npm install
```

That's it. No Docker, no cluster, no cloud account needed.

---

## Usage

```bash
npm start
```

Open **http://localhost:3000** in your browser.

```
┌─────────────────────────────────────────────────────┐
│  CKAD SIMULATOR  |  Exam Name  |  Prev  Q1/17  Next │
│                              ┌──────────────── 01:59:42 │
│  Question panel              │  Terminal              │
│                              │                        │
│  Namespace `pluto`           │  student@ckad-node:~$  │
│  Click any `code` to copy    │  k get pods -n pluto   │
│                              │  ...                   │
└──────────────────────────────┴────────────────────────┘
```

### Exam flow

1. Select an exam on the landing page.
2. Read the question — click any `inline code` to copy it to clipboard.
3. Use the terminal on the right to solve the task.
4. Navigate between questions with **Prev / Next** or the question dropdown.
5. Flag questions you want to revisit with **⚑ Flag**.
6. Click **End Exam** → enter **Review Mode**.
7. In review mode, tick the criteria checkboxes for each question to calculate your weighted score.

### Terminal quick reference

| Command | Behaviour |
|---|---|
| `k get pods -n <ns>` | Returns mock pod list for the namespace |
| `k explain <field>` | Real kubectl docs (uses local binary) |
| `k run pod --image=nginx --dry-run=client -o yaml` | Real YAML from local kubectl |
| `k apply -f /opt/course/p1/foo.yaml` | Simulated — prints "configured", writes nothing to any cluster |
| `ssh ckad9043` | Changes prompt to `student@ckad9043` |
| `exit` | Returns to `student@ckad-node` |
| `kubens <ns>` | Switches active namespace in context |
| `kubectx <ctx>` | Switches active context |
| `vim /opt/course/p1/foo.yaml` | Opens real vim inside the sandbox |
| `helm install …` | Simulated |
| `docker build …` | Simulated |

---

## Adding Custom Exams

Drop files into the `exams/` directory and reload the browser — they appear automatically.

### Exam file: `exams/examN.md`

```markdown
---
title: CKAD Mock Exam 2
duration: 120
pass_percentage: 66
---

# Question 1 | Liveness Probe
weight: 7
context: ssh ckad9043

In Namespace `pluto` there is a Deployment named `project-23-api`.
Implement a liveness probe on port `80` with `initialDelaySeconds: 10`
and `periodSeconds: 15`.

The original YAML is at `/opt/course/p1/project-23-api.yaml`.
Save your changes to `/opt/course/p1/project-23-api-new.yaml` and apply.

# Question 2 | Deployment and Service
weight: 4
context: ssh ckad9043

Create a Deployment named `sunny` with `4` replicas of `nginx:1.17.3-alpine`
in Namespace `sun` using ServiceAccount `sa-sun-deploy`.
```

**Frontmatter fields:**

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | string | `Exam N` | Display name |
| `duration` | number | `120` | Minutes |
| `pass_percentage` | number | `66` | Passing score threshold |

**Question format rules:**
- Header: `# Question {N} | Title`
- `weight:` — integer, contribution to final score (%)
- `context:` — shown as a badge above the question (e.g. `ssh ckad9043`)
- Body: standard Markdown; inline `code` becomes clickable/copyable

### Answer file: `exams/answerN.md`

```markdown
# Answer 1

- [ ] Deployment has a livenessProbe on port 80
- [ ] initialDelaySeconds is 10
- [ ] periodSeconds is 15
- [ ] Changes are applied to the cluster

**Solution:**

```bash
cp /opt/course/p1/project-23-api.yaml /opt/course/p1/project-23-api-new.yaml
vim /opt/course/p1/project-23-api-new.yaml
# Add under containers[0]:
#   livenessProbe:
#     tcpSocket:
#       port: 80
#     initialDelaySeconds: 10
#     periodSeconds: 15
k apply -f /opt/course/p1/project-23-api-new.yaml
```

---

# Answer 2

- [ ] Deployment `sunny` exists in namespace `sun`
- [ ] Replica count is 4
- [ ] Image is nginx:1.17.3-alpine
- [ ] ServiceAccount sa-sun-deploy is referenced

**Solution:**

...
```

**Answer format rules:**
- Header: `# Answer {N}` — must match the question number
- `- [ ] text` lines become interactive scoring checkboxes in review mode
- Everything else is rendered as Markdown documentation
- Separate answers with `---`

### Adding mock kubectl data for new namespaces

If your exam references a namespace with real-looking `k get` output, create a text file:

```
sandbox/etc/kubernetes/mock/<namespace>/pods.txt
sandbox/etc/kubernetes/mock/<namespace>/deploy.txt
sandbox/etc/kubernetes/mock/<namespace>/services.txt
sandbox/etc/kubernetes/mock/<namespace>/cronjobs.txt
```

The kubectl wrapper reads these files when `k get pods -n <namespace>` is called.

### Adding pre-existing exam files

Place YAML or text files at the paths referenced in your questions:

```
sandbox/opt/course/p1/project-23-api.yaml
sandbox/opt/course/p3/ticket-654.txt
sandbox/opt/course/p12/commands.sh
```

---

## Project Structure

```
ckad-simulator/
├── server.js                    # Express + WebSocket + node-pty server
├── package.json
│
├── public/                      # Static frontend (served by Express)
│   ├── index.html               # App shell with three screens: landing, exam, review
│   ├── style.css                # PSI exam-like dark/light theme
│   └── js/app.js + screens/   # Client: WS, xterm, timer, scoring
│
├── exams/                       # Exam content (add your own here)
│   ├── exam1.md                 # Questions with frontmatter
│   └── answer1.md               # Answers with scoring criteria
│
└── sandbox/                     # Isolated shell environment
    ├── .bashrc                  # Custom shell: path translation, cd guard, ssh/kubens/kubectx functions
    ├── .vimrc                   # YAML-friendly vim defaults (expandtab, sw=2, nu)
    ├── bin/                     # Command wrappers (take priority over system PATH)
    │   ├── kubectl              # Smart wrapper: safe cmds → real binary, mutations → simulated
    │   ├── k -> kubectl         # Exam alias
    │   ├── helm                 # Simulated
    │   ├── docker               # Simulated
    │   ├── podman               # Delegates to docker wrapper
    │   └── crictl               # Simulated
    ├── opt/course/              # Exam-referenced files (p1–p17)
    │   └── p1/project-23-api.yaml
    └── etc/kubernetes/
        ├── namespace            # Runtime: active namespace (git-ignored)
        ├── context              # Runtime: active context (git-ignored)
        ├── applied/             # Runtime: copies of applied YAMLs (git-ignored)
        └── mock/                # Static kubectl response fixtures per namespace
            ├── pluto/pods.txt
            ├── earth/deploy.txt
            └── ...
```

---

## FAQ

**Does this require a Kubernetes cluster?**  
No. The simulator works without any cluster. `kubectl explain` and `--dry-run=client` use your local `kubectl` binary (if installed) but never reach a server. All other kubectl commands are simulated.

**Will running `kubectl apply` inside the simulator affect my real cluster?**  
No. The shell environment has `KUBECONFIG=/dev/null`, making it impossible to connect to any cluster. Mutating commands (`apply`, `create`, `delete`) print realistic output but perform no real operations.

**Can I accidentally delete files outside the project?**  
No. The `cd` command is overridden to block navigation outside the `sandbox/` directory. File commands (`cat`, `cp`, `mv`, `rm`, `vim`) transparently rewrite absolute paths like `/opt/...` and `/tmp/...` to their sandbox equivalents.

**What happens when I type `ssh ckad9043`?**  
The shell prompt changes to `student@ckad9043`. No real SSH connection is made, no new process is spawned. Type `exit` to return to the base node prompt. All sandbox protections remain active throughout.

**Can I use vim?**  
Yes. vim runs fully inside the sandbox. The included `.vimrc` sets `expandtab`, `shiftwidth=2`, line numbers, and syntax highlighting — matching the real CKAD exam environment.

**How do I add my own exam questions?**  
Create `exams/exam2.md` and `exams/answer2.md` following the format described above, then reload the browser. No server restart needed.

**Does this work on Windows?**  
node-pty requires a POSIX shell environment. Use WSL2 (Ubuntu) on Windows.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express, ws (WebSocket) |
| Terminal I/O | node-pty (PTY), xterm.js (renderer), xterm-addon-fit |
| Markdown | marked.js |
| Shell | bash with custom `.bashrc` |
| Frontend | Vanilla JS, CSS — no framework |
