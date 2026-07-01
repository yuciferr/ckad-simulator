# 04 — Best Practices Assessment

> **Last updated:** July 2026  
> **Scope:** Code quality, security model, error handling, testing, documentation, and DevOps practices.

---

## 1. Code Quality

### 1.1 Server (`server.js`)

| Practice | Status | Details |
|----------|--------|---------|
| Single Responsibility | 🟠 | One file handles HTTP, WS, PTY, Markdown parsing, and session management. Should be split into modules. |
| Error handling | 🟡 | Most async operations have try/catch. PTY errors could be more explicitly surfaced. |
| Input validation | 🔴 | No validation on API inputs (e.g., exam ID from URL params). A path like `../../etc/passwd` in exam ID should be rejected. |
| Constants vs magic strings | 🟡 | Some magic strings (e.g., `'mock'`, `'practice'`, path fragments). Could benefit from a `constants.js`. |
| Async style | ✅ | Consistent use of `async/await` throughout. |
| Logging | 🟡 | `console.log` for all levels. No structured logging, no log levels (debug/info/warn/error). |
| Comments | ✅ | Key sections are commented. Not over-commented. |

### 1.2 Frontend (`public/app.js`)

| Practice | Status | Details |
|----------|--------|---------|
| Module separation | 🔴 | 1544 lines in a single global-scope file. All variables are `let`/`const` at module top level — effectively global. |
| State management | 🟡 | State is scattered across many top-level variables (`currentExam`, `currentQuestion`, `terminals`, etc.). No centralized state store. |
| DOM queries | 🟡 | Repeated `document.getElementById()` calls. Should cache DOM references. |
| Event listener cleanup | 🟠 | Terminal instances may not always have their event listeners cleaned up on navigation. |
| Error handling | 🟡 | WebSocket errors are caught. Markdown parse errors could crash the UI silently. |
| Code style | ✅ | Consistent, readable. Modern JS features (arrow functions, destructuring, template literals). |

### 1.3 Shell Scripts (`sandbox/bin/kubectl`, `k8s-lib.sh`)

| Practice | Status | Details |
|----------|--------|---------|
| Error handling | 🟡 | `set -e` is not used globally — errors in subcommands may be silently ignored. |
| Quoting | 🟡 | Most variable expansions are quoted, but edge cases (paths with spaces, special chars in resource names) may fail. |
| Shellcheck compliance | Unknown | No evidence of `shellcheck` being run. Likely several warnings. |
| Function documentation | 🟠 | Functions lack doc comments describing params/returns. |
| Test coverage | 🔴 | One untracked smoke test (`test-core-concepts-sandbox.sh`). No systematic test suite. |
| Bash version dependency | 🔴 | Uses bash 4+ features (`declare -A`) but macOS ships bash 3.2. Not documented or checked at startup. |

---

## 2. Security Model

### 2.1 Sandbox Security Layers

The simulator implements a **defense-in-depth** model appropriate for a single-user local tool:

```
Layer 1 (Highest): KUBECONFIG=/dev/null
  → No kubectl command can reach a real cluster.
  → Even if all other layers fail, no K8s write happens.

Layer 2: sandbox/bin/ first in PATH
  → All tool invocations go through wrappers.
  → Real binaries are only reachable by full path.

Layer 3: HOME=sandbox/
  → Shell history, vim config, profile, and temp files stay in sandbox.
  → Prevents contamination of the real user's home directory.

Layer 4: cd guard (.bashrc cd override)
  → Prevents navigating outside sandbox root.
  → Implemented via python3 realpath check.

Layer 5: Path translation (.bashrc translate_path)
  → /etc/kubernetes → sandbox/etc/kubernetes
  → /opt/course → sandbox/opt/course
  → /tmp → sandbox/tmp
```

### 2.2 Security Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| No network isolation | Medium | `curl`, `wget`, `nc` can reach the internet. A malicious exam content file could exfiltrate data. Acceptable for author-controlled content. |
| No process isolation | Medium | The user's bash session runs as the same OS user as the Node.js server. A crafty command like `kill $PPID` could kill the server process. |
| API input not sanitized | High | `GET /api/exams/:id` uses `id` directly in file path construction. A value like `../../package.json` would read that file. **This needs fixing before any hosted deployment.** |
| No authentication | Medium | Anyone on the same LAN as the running server can access it if the machine's firewall allows port 3000. |
| PTY injection | Low | If WebSocket input is forwarded directly to PTY without filtering, a crafted WebSocket payload could inject terminal escape sequences that change terminal state. |

### 2.3 Security Recommendation Priority

1. **Fix path traversal in `/api/exams/:id`** — validate that the resolved path stays within the `exams/` directory.
2. **Add a `--bind 127.0.0.1` flag** to restrict the server to localhost.
3. **Document network non-isolation** clearly in README for user awareness.
4. **Add process namespace isolation** (only relevant for hosted/multi-user scenarios).

---

## 3. Error Handling

### 3.1 Server

**Good:**
- PTY spawn errors are caught and reported to the client via WS
- Exam file not found → 404 JSON response
- Sandbox reset errors → logged

**Missing:**
- No global Express error handler (`app.use((err, req, res, next) => ...)`)
- Unhandled promise rejections could crash the Node process
- No `process.on('uncaughtException')` handler

**Recommendation:** Add a global error handler and a `process.on('unhandledRejection')` handler that logs the error but keeps the server alive.

### 3.2 Frontend

**Good:**
- WebSocket `onerror` and `onclose` are handled
- `marked.parse()` failures don't crash the page (falls back to raw text in some paths)

**Missing:**
- No retry logic for WebSocket reconnection
- If the server restarts, the client has no recovery path — user must refresh manually
- No loading/error states for API calls (failed `/api/exams` load shows a blank landing)

---

## 4. Testing Coverage

### 4.1 Current State

| Test type | Status |
|-----------|--------|
| Unit tests (scoring logic) | 🔴 None |
| Unit tests (Markdown parser) | 🔴 None |
| Unit tests (kubectl simulation) | 🔴 None |
| Integration tests (sandbox) | 🟡 One untracked shell smoke test |
| E2E tests (exam flow) | 🔴 None |
| Performance tests | 🔴 None |

**The scoring logic in `app.js` is the highest-value untested code.** A bug in `commandMatches()` or `scoreOneCriterion()` would silently give wrong scores — the core value proposition of the tool.

### 4.2 Recommended Test Matrix

```
Priority 1 — Unit tests (Vitest):
  ✓ parseFrontmatter() — valid, missing fields, malformed
  ✓ parseQuestions() — single, multiple, with/without weight
  ✓ parseAnswers() — criteria extraction, OR paths
  ✓ commandMatches() — alias expansion, flag normalization
  ✓ scoreOneCriterion() — true/false cases per criterion type

Priority 2 — Shell tests (bats-core):
  ✓ kubectl get pods (mock namespace)
  ✓ kubectl run + kubectl get pods (session namespace)
  ✓ kubectl apply -f → kubectl get
  ✓ kubectl dry-run output is valid YAML
  ✓ Namespace isolation (no cross-namespace leakage)
  ✓ cd guard (cannot escape sandbox)

Priority 3 — E2E (Playwright):
  ✓ Start exam → answer question → end → review score > 0
  ✓ Practice module → check answer → pass
  ✓ Timer counts down correctly
  ✓ Terminal renders and accepts input
```

---

## 5. Documentation Quality

| Document | Quality | Notes |
|----------|---------|-------|
| `README.md` | ✅ Good | Covers installation, usage, architecture, FAQ (361 lines) |
| Inline code comments | 🟡 Adequate | Present in key areas; missing for complex bash logic |
| Exam format spec | 🟡 Partial | README has examples but no formal schema |
| API documentation | 🔴 None | No OpenAPI spec or even inline comments for endpoints |
| Contributing guide | 🔴 None | Critical for open-source; needed before public launch |
| Changelog | 🔴 None | No `CHANGELOG.md` |
| License | 🔴 None | No `LICENSE` file — **required for open-source** |

---

## 6. DevOps Practices

| Practice | Status | Notes |
|----------|--------|-------|
| `.gitignore` | ✅ Good | Correctly excludes runtime state, node_modules |
| Commit message convention | ✅ Good | Uses conventional commits (`feat:`, `fix:`, `docs:`) |
| Branch strategy | Unknown | No evidence of branch protection rules |
| CI/CD pipeline | 🔴 None | No `.gitlab-ci.yml` or `.github/workflows/` |
| Semantic versioning | 🔴 None | No version tag on any release |
| Dependency auditing | 🔴 None | `npm audit` not automated |
| Docker / container build | 🔴 None | No `Dockerfile` or `docker-compose.yml` |

---

## 7. Accessibility and UX

| Area | Status | Notes |
|------|--------|-------|
| Keyboard navigation | 🟡 Partial | Terminal is keyboard-first; question navigation buttons work with mouse only |
| Screen reader support | 🔴 None | Terminal content is not accessible to screen readers (inherent xterm.js limitation) |
| Color contrast | ✅ Good | PSI-style dark theme has good contrast ratios |
| Mobile support | 🔴 None | Terminal requires keyboard; not designed for mobile |
| Font size | ✅ Good | xterm.js font size is configurable via `addon-fit` |
| Error messages | 🟡 Partial | Most errors are silent or show generic messages |

---

## 8. Conventions and Code Style

The project has **no enforced style** (no `.eslintrc`, no `.prettierrc`, no `editorconfig`). Currently consistent due to single author, but will diverge with contributors.

**Recommended baseline config:**

```json
// .eslintrc.json
{
  "env": { "browser": true, "node": true, "es2022": true },
  "extends": ["eslint:recommended"],
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off"
  }
}
```

```json
// .prettierrc
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

```ini
# .editorconfig
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

---

## 9. Summary Scorecard

| Category | Score | Weight |
|----------|-------|--------|
| Code organization | 60/100 | High |
| Security model | 75/100 | High |
| Error handling | 55/100 | Medium |
| Test coverage | 5/100 | High |
| Documentation | 65/100 | High |
| DevOps practices | 15/100 | Medium |
| UX/Accessibility | 60/100 | Low |

**Overall best practices score: ~48/100**

The project scores well on security model and documentation but significantly under-performs on testing and DevOps automation — the two highest-priority areas for open-source readiness.
