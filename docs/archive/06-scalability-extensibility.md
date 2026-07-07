# 06 — Scalability & Extensibility

> **Last updated:** July 2026  
> **Scope:** How to grow the project — more content, more certifications, more users, and a plugin model for exam scenarios.

---

## 1. Current Extensibility Model

The project already has a deliberate extensibility design for exam content:

### 1.1 Adding a New Practice Module (Today)

The current process to add a new practice topic is straightforward:

```bash
# 1. Create the directory
mkdir exams/network_policies

# 2. Create exam.md with this header format:
cat > exams/network_policies/exam.md << 'EOF'
---
title: Network Policies
duration: 60
pass_percentage: 75
topics: [networking, security]
---

# Question 1 | Deny All Ingress
weight: 20%
...
EOF

# 3. Create answer.md with scoring criteria:
cat > exams/network_policies/answer.md << 'EOF'
# Answer 1
- [ ] NetworkPolicy created in correct namespace
- [ ] spec.podSelector matches target pods
- [ ] policyTypes includes Ingress
- [ ] No ingress rules defined (deny-all pattern)

**Solution:**
```bash
kubectl apply -f - <<YAML
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
...
YAML
```
EOF
```

The server auto-discovers this directory on next request to `/api/exams` — no server restart needed if the exam registry is re-read on each request.

### 1.2 Adding a New Mock Exam (Today)

Create `exams/exam2.md` + `exams/answer2.md`. The server auto-discovers all `examN.md` files.

### 1.3 Content Conversion Tool

The `scripts/convert-ckad-exercises.js` script converts the popular [dgkanatsios/CKAD-exercises](https://github.com/dgkanatsios/CKAD-exercises) format into the simulator's format. This makes it trivial to import community-maintained question sets.

---

## 2. Content Scalability

### 2.1 Current Content Volume

| Exam type | Count | Questions |
|-----------|-------|-----------|
| Mock exams | 1 | 17 |
| Practice modules | 10 | ~150 |
| **Total** | **11** | **~167** |

### 2.2 Target Content Volume (Open-Source Vision)

| Certification | Mock Exams | Practice Modules | Questions |
|--------------|-----------|-----------------|-----------|
| CKAD | 3 | 12 | ~250 |
| CKA | 3 | 15 | ~300 |
| CKS | 2 | 10 | ~150 |
| KCNA | 1 | 8 | ~100 |
| **Total** | **9** | **45** | **~800** |

The current architecture can support this volume **without any changes** — it's just Markdown files and shell fixtures.

### 2.3 Content Freshness Strategy

CKAD/CKA exam content changes with Kubernetes API versions. The content needs a versioning strategy:

```
exams/
├── ckad/                  ← certification root
│   ├── v1.30/             ← K8s version tag
│   │   ├── mock/exam1.md
│   │   └── practice/core_concepts/exam.md
│   └── v1.31/
│       └── ...
└── cka/
    └── v1.31/
        └── ...
```

Or a simpler approach: tag exam files with `k8s_version: "1.30+"` in frontmatter and show a compatibility badge in the UI.

---

## 3. Simulation Engine Scalability

### 3.1 Current Simulation Boundaries

The bash-based kubectl simulation has inherent scalability limits:

| Resource | Mock depth | Session depth | Notes |
|----------|-----------|--------------|-------|
| Pods | Full | Full | Core feature |
| Deployments | Good | Good | |
| Services | Minimal | None | Needs work |
| ConfigMaps | None | Create-only | Needs work |
| Ingress | Static fixture | None | Needs work |
| RBAC | Static fixture | Create-only | Needs work |
| CRDs | None | None | Significant gap |
| NetworkPolicy | Static fixture | None | Needs work |

### 3.2 Simulation Depth Options

**Option A: Deepen the bash simulation** (incremental improvement)
- Pro: No architectural change required
- Pro: Works offline, no external dependencies
- Con: Bash gets increasingly complex and hard to test
- Con: Cannot simulate real scheduling, pod lifecycle, or controller behavior
- Recommended for: short-term, while the project is primarily a personal tool

**Option B: Embed a real Kubernetes cluster** (transformational change)
- Use `kind` or `k3s` running locally, one namespace per user session
- Pro: 100% accurate simulation — real kubectl behavior
- Pro: NetworkPolicy, CRDs, Ingress all work natively
- Con: Heavy — k3s alone uses ~512MB RAM minimum
- Con: Complex session lifecycle management
- Recommended for: hosted/multi-user version only

**Option C: Hybrid model** (recommended long-term)
- Keep bash simulation for offline/lightweight use (`--mode=mock`)
- Add optional real cluster integration (`--mode=real`) using a local kind cluster
- Users choose based on their machine capabilities

```
ckad-simulator/
├── modes/
│   ├── mock/              ← current bash simulation
│   │   └── sandbox/
│   └── real/              ← future kind integration
│       ├── setup-cluster.sh
│       ├── create-namespaces.sh
│       └── cleanup-session.sh
```

---

## 4. Multi-Certification Architecture

### 4.1 Certification Registry Concept

To support CKAD, CKA, CKS, and KCNA, introduce a **certification registry**:

```json
// certifications.json
{
  "ckad": {
    "name": "Certified Kubernetes Application Developer",
    "version": "v1.31",
    "duration": 120,
    "passPercentage": 66,
    "domains": [
      { "name": "Application Design and Build", "weight": 20 },
      { "name": "Application Deployment", "weight": 20 },
      { "name": "Application Observability and Maintenance", "weight": 15 },
      { "name": "Application Environment, Configuration and Security", "weight": 25 },
      { "name": "Services and Networking", "weight": 20 }
    ]
  },
  "cka": { ... },
  "cks": { ... }
}
```

This drives:
- Exam duration and pass threshold
- Domain weight display in review
- Content filtering by certification

### 4.2 Domain Coverage Dashboard

A future feature: show users which CKAD domains they've practiced and their coverage percentage:

```
CKAD Domain Coverage:
├── Application Design and Build     ████████░░  80% (12/15 topics covered)
├── Application Deployment           ██████░░░░  60%
├── Application Observability        █████████░  90%
├── Config & Security                ███████░░░  70%
└── Services & Networking            ████░░░░░░  40%

Recommended: Practice more on Services & Networking
```

---

## 5. Plugin Model for Exam Scenarios

### 5.1 Current "Plugin" Surface

Today, a new exam scenario requires:
1. A Markdown file (`exam.md`)
2. A Markdown answer file (`answer.md`)
3. Optionally: fixture files in `sandbox/etc/kubernetes/mock/<namespace>/`
4. Optionally: task files in `sandbox/opt/course/`

This is already a form of plugin — the simulator auto-discovers all content.

### 5.2 Formal Plugin Specification (Future)

A community contributor should be able to package a scenario as a self-contained directory:

```
scenarios/
└── network-policies-advanced/
    ├── scenario.json          ← metadata + requirements
    ├── exam.md                ← questions
    ├── answer.md              ← scoring criteria + solutions
    ├── fixtures/
    │   └── mock/
    │       └── prod-ns/pods.txt
    └── task-files/
        └── p1/starter.yaml
```

```json
// scenario.json
{
  "id": "network-policies-advanced",
  "title": "Advanced Network Policies",
  "certification": ["ckad", "cka"],
  "difficulty": "advanced",
  "k8sVersion": ">=1.28",
  "author": "community",
  "license": "MIT",
  "requires": {
    "kubectlSimulation": ["networkpolicy", "pod", "namespace"]
  }
}
```

A setup script would:
1. Validate `scenario.json`
2. Copy fixture files to the correct sandbox locations
3. Register the scenario in the exam registry

---

## 6. Multi-User Scalability

### 6.1 Current Limitation

The server has a **single global PTY map** (`const terminals = new Map()`). This means:
- Two browser tabs interfere with each other (they share PTYs)
- No session isolation between users
- No concurrent user support

### 6.2 Single-User Session Model (Near-Term Fix)

Add a session ID to isolate even multiple tabs from the same user:

```javascript
// WS message: { sessionId: "abc123", questionId: 2, type: "input", data: "ls\n" }
// Server: Map<sessionId, Map<questionId, PTY>>
const sessions = new Map();
```

Generate `sessionId` in `app.js` on page load (`crypto.randomUUID()`), send with every WS message.

### 6.3 Multi-User Architecture (Long-Term)

For a hosted service supporting multiple concurrent users:

```
                  ┌─────────────────────────────┐
Browser user A ──→ │                             │
Browser user B ──→ │  Load Balancer              │
Browser user C ──→ │  (Nginx / Cloudflare)       │
                  └────────────┬────────────────┘
                               │
                  ┌────────────▼────────────────┐
                  │  Session Manager (Redis)      │
                  │  session_id → user_id        │
                  │  session_id → container_id   │
                  └────────────┬────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  Sandbox     │   │  Sandbox     │   │  Sandbox     │
   │  Container A │   │  Container B │   │  Container C │
   │  (Docker)    │   │  (Docker)    │   │  (Docker)    │
   └──────────────┘   └──────────────┘   └──────────────┘
```

This requires:
- Docker/container runtime
- Session management (Redis or in-memory for small scale)
- Container lifecycle management (start/stop/TTL)
- WebSocket proxy that routes to correct container

---

## 7. Content Contribution Scalability

### 7.1 Bottleneck Today

All content is in the monorepo. As the question count grows to 800+, a single `exams/` directory becomes unwieldy.

### 7.2 Proposed Content Organization

```
exams/
├── ckad/
│   ├── mock/
│   │   ├── exam1.md + answer1.md + fixtures/
│   │   ├── exam2.md + answer2.md + fixtures/
│   │   └── exam3.md + answer3.md + fixtures/
│   └── practice/
│       ├── core_concepts/
│       ├── pod_design/
│       └── ...
├── cka/
│   ├── mock/
│   └── practice/
└── cks/
    ├── mock/
    └── practice/
```

### 7.3 Community Content Pipeline

```
Contributor creates PR with:
  → New scenario directory
  → scenario.json (metadata)
  → exam.md + answer.md
  → fixtures/ (if needed)

CI pipeline:
  1. Validate scenario.json schema
  2. Parse exam.md and answer.md (no parse errors)
  3. Run smoke test: kubectl get works for all fixture namespaces
  4. Check answer.md criteria syntax is valid
  5. Verify weight sum = 100% (for mock exams)

Merge → auto-publishes to simulator content index
```

---

## 8. Performance Scalability

### 8.1 Current Performance Profile

- **Startup time:** < 1 second (just Node.js + Express)
- **Exam load:** Reads + parses Markdown files on each request (no cache)
- **Terminal:** One PTY per question tab (up to 17 for mock exam)
- **Memory:** ~50MB for Node process + ~5MB per active PTY

### 8.2 Performance Optimizations

**Cache exam content in memory:**
```javascript
const examCache = new Map();

async function getExam(id) {
  if (examCache.has(id)) return examCache.get(id);
  const exam = await parseExamFile(id);
  examCache.set(id, exam);
  return exam;
}
```

**Lazy PTY creation:**  
Only create a PTY when the user navigates to that question for the first time, not when the exam loads.

**PTY pooling:**  
Pre-spawn a small pool of bash processes, assign on demand, return to pool on question exit.

---

## 9. Extensibility Summary

| Dimension | Today | With Improvements | Long-Term Vision |
|-----------|-------|-------------------|-----------------|
| Certifications | 1 (CKAD) | 1-4 (add CKA/CKS/KCNA) | 6+ (all K8s certs) |
| Practice questions | ~167 | ~300 | ~800+ |
| Mock exams | 1 | 3 per cert | 5+ per cert |
| Simulation depth | 60% kubectl | 80% kubectl | Optional real cluster |
| Contributors | 1 | Multiple (with CONTRIBUTING.md) | Community-driven |
| Concurrent users | 1 | 1 (session isolation) | Hundreds (with containers) |
| Deployment | Local only | Local + Docker | Hosted option |
