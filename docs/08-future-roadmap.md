# 08 — Future Roadmap

> **Last updated:** July 2026  
> **Scope:** Feature ideas, open-source transformation plan, and prioritized development phases.

---

## Vision Statement

Transform CKAD Simulator from a personal learning tool into the **best free, open-source Kubernetes certification practice environment** — one that anyone can run locally in seconds, contribute content to, and use to genuinely pass CKAD, CKA, and CKS exams.

---

## Phase 0 — Foundation (Current → Open-Source Ready)

**Goal:** Fix critical gaps and make the project safe and welcoming for public contributors.  
**Estimated effort:** 1–2 weeks solo

### Milestones

- [ ] **0.1** — Fix path traversal vulnerability in `/api/exams/:id`
- [ ] **0.2** — Fix mock exam weight sum (93% → 100%)
- [ ] **0.3** — Resolve SSH implementation conflict (`bin/ssh` vs `.bashrc` function)
- [ ] **0.4** — Add `LICENSE` file (MIT recommended)
- [ ] **0.5** — Add `CONTRIBUTING.md` with content and code contribution guides
- [ ] **0.6** — Add `CHANGELOG.md` with v1.0 entry
- [ ] **0.7** — Add `.eslintrc.json`, `.prettierrc`, `.editorconfig`
- [ ] **0.8** — Add `npm test` with at least one passing test (Vitest)
- [ ] **0.9** — Add `Dockerfile` and `docker-compose.yml`
- [ ] **0.10** — Complete missing fixtures for exam1 (8 namespaces + opt/course files)

**Deliverable:** v1.0.0 tagged release on GitHub/GitLab

---

## Phase 1 — Quality & Testing

**Goal:** Establish a testing foundation that prevents regressions as the project grows.  
**Estimated effort:** 2–3 weeks

### Features

#### 1.1 Unit Test Suite (Vitest)

Cover the most critical and complex logic:

```
tests/unit/
├── exam-parser.test.js       # parseFrontmatter, parseQuestions, parseAnswers
├── mock-scorer.test.js       # scoreOneCriterion, weighted total calculation
├── practice-scorer.test.js   # commandMatches, intentMatchesHistory, alias map
└── sandbox-reset.test.js     # Reset logic, namespace extraction
```

Target: **80% coverage** on scoring and parsing logic.

#### 1.2 Shell Test Suite (bats-core)

```
tests/shell/
├── kubectl-get.bats          # get pods/deploy/svc in mock + session ns
├── kubectl-apply.bats        # apply → get → verify state
├── kubectl-run.bats          # run pod → logs → exec → delete
├── kubectl-dryrun.bats       # dry-run generates valid YAML
├── sandbox-isolation.bats    # cd guard, PATH isolation, KUBECONFIG
└── kubectl-rbac.bats         # create serviceaccount, rolebinding
```

#### 1.3 CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test

  shell-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get install -y bats
      - run: npm ci  # needed for server to be available
      - run: bats tests/shell/

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ckad-simulator .
      - run: docker run --rm -d -p 3000:3000 ckad-simulator
      - run: curl --retry 5 --retry-delay 2 http://localhost:3000/api/exams
```

---

## Phase 2 — Simulation Depth

**Goal:** Make the kubectl simulation accurate enough that users can practice all CKAD exam tasks without hitting simulation gaps.  
**Estimated effort:** 3–4 weeks

### Features

#### 2.1 Complete Resource State Coverage

Implement full `get/describe/create/apply/delete` for:

| Resource | Priority | Reason |
|----------|---------|--------|
| Service | P0 | Required in 8+ CKAD tasks |
| ConfigMap | P0 | Required in 5+ CKAD tasks |
| Secret | P0 | Required in 5+ CKAD tasks |
| CronJob | P1 | Q4 of mock exam |
| Job | P1 | Q15 of mock exam |
| PersistentVolumeClaim | P1 | Q9 of mock exam |
| Ingress | P1 | Q11 of mock exam |
| ServiceAccount | P1 | RBAC tasks |
| Role / RoleBinding | P1 | Q10 of mock exam |
| NetworkPolicy | P2 | Q5 of mock exam |
| HorizontalPodAutoscaler | P2 | CKA tasks |

#### 2.2 kubectl edit Support

Currently, `kubectl edit` is not supported. Users have to delete-and-recreate resources. Add:
- Open a temp file in vim with the current resource YAML
- On vim exit, parse the modified YAML and update session state

#### 2.3 Multi-Container Pod Simulation

Improve `kubectl exec` and `kubectl logs` to:
- Support `-c <container-name>` flag
- Show correct container-specific logs
- Handle init containers

#### 2.4 Rollout Simulation

Improve `kubectl rollout` to:
- Track revision history for Deployments
- Support `rollout undo` (restores previous revision)
- Support `rollout status` with realistic output

#### 2.5 Helm State Management

Full Helm release lifecycle:
- `helm install` → persists release state
- `helm list` → reads persisted releases
- `helm status` → shows release info
- `helm upgrade` → increments revision
- `helm uninstall` → removes release and associated resources
- `helm rollback` → reverts to previous revision

---

## Phase 3 — Content Expansion

**Goal:** Cover all CKAD exam domains comprehensively and begin CKA content.  
**Estimated effort:** Ongoing (content-focused)

### Features

#### 3.1 CKAD Mock Exams 2 and 3

Each mock exam should:
- Cover different scenarios than exam1 (no duplicate namespace names)
- Have complete fixtures for all referenced namespaces
- Sum weights to exactly 100%
- Include a mix of difficulty levels

**Suggested exam themes:**
- Exam 2: Focus on networking (NetworkPolicy, Ingress, Services)
- Exam 3: Focus on storage + security (PVC, RBAC, Security Contexts)

#### 3.2 Missing Practice Module Content

| Module | Current | Target |
|--------|---------|--------|
| multi_container_pods | 2 questions | 10 questions |
| networking (new) | 0 | 15 questions |
| storage (new) | 0 | 10 questions |
| security (new) | 0 | 12 questions |

#### 3.3 CKA Practice Modules

Start the CKA content track:
- `exams/cka/practice/cluster_setup/`
- `exams/cka/practice/node_management/`
- `exams/cka/practice/etcd/`
- `exams/cka/practice/networking/`

#### 3.4 Content Versioning

Tag all exam content with the minimum Kubernetes version:
```yaml
---
title: CronJobs
k8s_version: ">=1.25"
deprecated_in: ""
---
```

Display a version badge in the UI when the user's target K8s version doesn't match.

---

## Phase 4 — Developer Experience

**Goal:** Make the project easy to set up, contribute to, and run in any environment.  
**Estimated effort:** 2–3 weeks

### Features

#### 4.1 TypeScript Migration

Migrate `server.js` and `public/app.js` to TypeScript:

```typescript
// src/types/exam.ts
export interface ExamQuestion {
  id: number;
  title: string;
  weight: number;
  context?: string;
  body: string;
}

export interface ScoringCriterion {
  text: string;
  checked: boolean;
  autoScore?: boolean;
}

export interface ExamMeta {
  id: string;
  title: string;
  duration: number;
  passPercentage: number;
  group: 'mock' | 'practice';
}
```

#### 4.2 Frontend Modularization

Split `public/app.js` into ES modules (see [05 — Improvement Areas](./05-improvement-areas.md) §3.2 for full structure).

#### 4.3 Hot Reload for Development

```bash
npm run dev
# Starts nodemon + browser-sync or similar
# Changes to server.js → server restart
# Changes to public/ → browser refresh
# Changes to exams/*.md → in-memory cache cleared
```

#### 4.4 Exam Content Validator CLI

```bash
npm run validate-exams
# → Checks all exam.md files for:
#   - Valid frontmatter
#   - Weight sum == 100% (for mock exams)
#   - All context: namespaces have fixture directories
#   - All opt/course/ file references exist
#   - No broken Markdown links

# Example output:
✅ core_concepts/exam.md — valid (18 questions, no issues)
❌ exam1.md — weights sum to 93% (expected 100%)
⚠️  exam1.md — namespace 'sun' has no fixture directory
```

---

## Phase 5 — UX Improvements

**Goal:** Make the exam experience more realistic and more helpful.  
**Estimated effort:** 3–4 weeks

### Features

#### 5.1 Session Persistence

Save exam state (current question, flags, notepad, time remaining) to `localStorage`:
```javascript
localStorage.setItem('examSession', JSON.stringify({ examId, currentQuestion, flags, notepad, timeLeft }));
```

On page load, offer to resume a previous session.

#### 5.2 Split View Customization

Allow users to drag the divider between question panel and terminal to resize them (currently fixed-width split).

#### 5.3 Multiple Terminal Tabs (like real PSI)

In the real CKAD exam, you get a terminal. Show multiple `bash` tabs within the terminal panel:
- "Main Terminal"
- "Editor Terminal" (auto-opens vim)

#### 5.4 Question Difficulty Indicator

Add `difficulty: easy|medium|hard` to exam question frontmatter. Display a badge on each question in the navigation bar.

#### 5.5 Practice Progress Tracking

Track which practice questions the user has answered correctly:
```javascript
// localStorage: { 'core_concepts': { 1: 'pass', 2: 'fail', 3: null }, ... }
```

Show a progress bar per practice module on the landing page.

#### 5.6 Answer Reveal Animation

In practice mode, add a "Show Hint" button before "Show Answer" — reveals only the first 2 criteria, encouraging the user to think before seeing the solution.

#### 5.7 Keyboard Shortcuts

| Shortcut | Action |
|---------|--------|
| `Alt+N` | Next question |
| `Alt+P` | Previous question |
| `Alt+F` | Flag/unflag current question |
| `Alt+T` | Focus terminal |
| `Alt+Q` | Focus question panel |
| `Alt+M` | Open notepad |

---

## Phase 6 — Open-Source Ecosystem

**Goal:** Build the community and tooling around the project.  
**Estimated effort:** Ongoing

### Features

#### 6.1 GitHub/GitLab Repository Polish

- GitHub Topics: `kubernetes`, `ckad`, `cka`, `certification`, `kubectl`, `practice`, `simulator`
- Good First Issues labeled in the issue tracker
- Issue templates for: bug report, new exam content, feature request
- PR template with checklist

#### 6.2 Website / Documentation Site

A static documentation site (Docusaurus, VitePress, or Astro):
- Landing page with demo screenshots
- Getting started guide
- Exam content authoring guide
- API reference
- Changelog

#### 6.3 Content Contribution Pipeline

```
Contributor forks repo
→ Adds new scenario in exams/<cert>/<topic>/
→ Opens PR
→ CI validates scenario schema + fixture completeness
→ Maintainer reviews content accuracy
→ Merge → appears in next release
```

#### 6.4 Optional Real Cluster Mode

```bash
# For advanced users with kind installed:
npm run setup-cluster          # starts kind cluster + installs namespaces
SIMULATOR_MODE=real node server.js   # routes kubectl to real cluster

# For hosted/classroom use:
docker-compose --profile real up   # includes kind sidecar
```

#### 6.5 Exam Score Sharing (Optional)

Allow users to export a score card as an image:
```
┌────────────────────────────────────┐
│  CKAD Mock Exam 1 — Score: 87%     │
│  Passed! (threshold: 66%)          │
│  Time used: 95/120 minutes         │
│  Strongest: RBAC, ConfigMaps       │
│  Weakest: NetworkPolicy, Ingress   │
└────────────────────────────────────┘
```

---

## Roadmap Summary Table

| Phase | Name | Priority | Effort | Status |
|-------|------|---------|--------|--------|
| 0 | Foundation & OSS Prep | 🔴 Critical | 1-2 weeks | In progress |
| 1 | Quality & Testing | 🟠 High | 2-3 weeks | Planned |
| 2 | Simulation Depth | 🟠 High | 3-4 weeks | Planned |
| 3 | Content Expansion | 🟡 Medium | Ongoing | Planned |
| 4 | Developer Experience | 🟡 Medium | 2-3 weeks | Planned |
| 5 | UX Improvements | 🟡 Medium | 3-4 weeks | Future |
| 6 | Open-Source Ecosystem | 🟢 Low | Ongoing | Future |

---

## Near-Term Focus (Next 30 Days)

If you have limited time, this is the highest-impact order of work:

1. **Fix path traversal + weight sum** — correctness before anything else
2. **Add `LICENSE` + `CONTRIBUTING.md`** — enables community contributions
3. **Add `Dockerfile`** — one-command setup is the single biggest contributor acquisition lever
4. **Complete exam1 fixtures** — makes the mock exam actually functional
5. **Add first 10 unit tests for scoring logic** — prevents silent regressions
6. **Open the repository** — everything else can be done iteratively with the community

---

## Success Metrics

The project is succeeding if:

| Metric | Target |
|--------|--------|
| GitHub stars | 500+ within 6 months of public launch |
| Mock exam completion rate | >70% of users who start finish the exam |
| Scoring accuracy (vs real exam) | Users who score 80%+ here pass the real exam |
| Community PRs (content) | 10+ external PRs in first 3 months |
| Setup time (cold start) | < 2 minutes from `git clone` to first terminal |
| CKAD domain coverage | 100% of all CKAD domains covered in practice modules |
