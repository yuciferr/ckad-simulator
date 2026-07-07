# 03 — Tech Stack Evaluation

> **Last updated:** July 2026  
> **Scope:** All runtime dependencies, their version choices, alternatives considered, and upgrade paths.

---

## 1. Full Dependency Map

### 1.1 Production Dependencies (`package.json`)

| Package | Version | Role | CDN? |
|---------|---------|------|------|
| `express` | ^4.21.0 | HTTP server, static files | No |
| `ws` | ^8.18.0 | WebSocket server | No |
| `node-pty` | ^1.2.0-beta.11 | PTY (pseudo-terminal) process spawning | No |

**Note:** Only 3 npm packages — an intentionally minimal footprint.

### 1.2 Frontend CDN Dependencies

| Library | Version | Role |
|---------|---------|------|
| `xterm.js` | 5.3.0 | Browser-based terminal emulator |
| `xterm-addon-fit` | 0.8.0 | Auto-resize terminal to container |
| `marked.js` | 4.3.0 | Markdown → HTML rendering |

**All loaded from CDN** — no bundler, no `node_modules` on the client.

### 1.3 Runtime Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 | `node-pty` requires native compilation; v20/v22 LTS recommended |
| macOS | 12+ | Tested environment; Xcode Command Line Tools required for `node-pty` build |
| Linux | Any modern | Should work; requires `python3` + `make` + `g++` for node-pty |
| Windows | Not directly | WSL2 required (POSIX dependency chain) |
| `kubectl` | Any | Optional; only used for `explain` and `--help` passthrough |
| `helm` | Any | Optional; only used for `--help` passthrough |
| `docker` / `podman` | Any | Optional; only used for `--help` passthrough |

---

## 2. Individual Technology Evaluation

### 2.1 Node.js + Express

**Rating: ✅ Excellent choice**

| Criterion | Assessment |
|-----------|-----------|
| Fit for purpose | Perfect — HTTP + WebSocket + process spawn in one ecosystem |
| Maturity | Battle-tested; Express 4 LTS |
| Bundle size | Minimal for a local tool |
| Alternatives | Fastify (faster), Hono (modern), Bun (all-in-one) |
| Migration risk | Low — Express 4→5 migration is non-breaking for this use case |

**Recommendation:** Consider migrating to **Express 5** (released 2024) when doing a maintenance pass. The API is largely compatible.

**Future consideration:** If TypeScript is adopted (recommended — see below), **Fastify** or **Hono** with type-safe route definitions would be a better fit than Express.

---

### 2.2 `ws` (WebSocket library)

**Rating: ✅ Good choice**

| Criterion | Assessment |
|-----------|-----------|
| Performance | Fastest pure-JS WebSocket library for Node |
| API simplicity | Very low-level — manual message parsing required |
| Alternatives | `socket.io` (higher-level, reconnect built-in), native `ws` |
| Current usage | Raw binary/text messages with JSON for control, binary for terminal I/O |

**Issue:** The current WS protocol is informal — there's no message schema or version negotiation. A disconnect/reconnect scenario could cause PTY mismatch if the client reconnects with a different question context.

**Recommendation:** Define a simple typed message protocol (JSON-based) with message types like `{ type: "input" | "resize" | "ping", questionId, data }`.

---

### 2.3 `node-pty`

**Rating: ✅ Correct tool, version concern**

| Criterion | Assessment |
|-----------|-----------|
| Fit for purpose | The only production-quality PTY library for Node.js |
| Native compilation | Requires build tools — the main setup friction point |
| Version used | `^1.2.0-beta.11` — **pre-release beta** |
| Stability | Beta tag is misleading; the library is widely used (VS Code uses it) |
| Alternatives | None viable for true PTY behavior |

**Risk:** Using a `beta` version in `package.json`. While `node-pty` is stable in practice, the beta tag could cause issues with some package managers or auditing tools.

**Recommendation:** Evaluate if `1.0.0` stable is available or if the API has changed. Pin to a specific version rather than `^1.2.0-beta.11` to prevent unexpected updates. Consider `1.0.0` if it exists and is compatible.

---

### 2.4 xterm.js (CDN 5.3.0)

**Rating: ✅ Excellent choice**

| Criterion | Assessment |
|-----------|-----------|
| Industry standard | Used by VS Code Terminal, GitHub Codespaces, Replit |
| Version 5.3.0 | Stable release; well-supported |
| CDN loading | Fast; no build step |
| Feature completeness | Full ANSI escape support, mouse events, selection, clipboard |

**Minor issue:** CDN dependency creates a hard external dependency. If the CDN is unavailable offline, the terminal won't render. For an offline-capable tool, bundle xterm.js locally.

**Recommendation:** Either:
1. Vendor xterm.js into `public/vendor/` (simple copy), OR
2. Add `xterm` and `xterm-addon-fit` as `devDependencies` and serve from `node_modules` (requires a minor server route change).

---

### 2.5 marked.js (CDN 4.3.0)

**Rating: 🟡 Works but outdated**

| Criterion | Assessment |
|-----------|-----------|
| Current version | 4.3.0 (CDN) — **marked 14.x is current (2026)** |
| Breaking changes | marked 5+ has API changes (async parse, different options) |
| XSS risk | marked renders untrusted Markdown; exam content is author-controlled so risk is low |
| Alternatives | `micromark`, `remark`, `markdown-it` |

**Recommendation:** Update to marked 14.x or switch to `markdown-it` (maintained, faster, safer defaults). This requires updating the `marked.parse()` call sites in `app.js`.

---

### 2.6 Bash as the simulation language

**Rating: 🟡 Pragmatic but reaching limits**

The core simulation logic (`kubectl` wrapper, `k8s-lib.sh`) is ~1800 lines of bash.

| Criterion | Assessment |
|-----------|-----------|
| Fit for purpose | Shell scripts can directly manipulate files, run subprocesses natively |
| Debuggability | `bash -x` tracing; but complex logic is hard to test in bash |
| Maintainability | Bash arrays/maps are fragile; no types; quoting bugs are common |
| Portability | Requires bash 4+ (macOS ships bash 3.2 — needs `brew install bash` or `/usr/local/bin/bash`) |
| Testability | `bats-core` framework exists but not used |
| Alternatives | Rewrite simulation in Node.js (same process as server) |

**Critical issue:** macOS ships **bash 3.2** (due to GPL licensing), but the scripts use bash 4+ features (associative arrays `declare -A`, `readarray`, etc.). This likely works on macOS only when `/usr/local/bin/bash` or `/opt/homebrew/bin/bash` is used — but the shebang/PTY spawn may use `/bin/bash` (3.2) on some systems.

**Recommendation:** 
1. Short-term: Add a bash version check to `server.js` startup and warn/fail if bash < 4.
2. Long-term: Consider rewriting the kubectl simulation in Node.js/TypeScript as a module imported by `server.js`, eliminating the bash dependency for simulation logic.

---

### 2.7 Vanilla JavaScript Frontend

**Rating: 🟡 Fine now, will become a bottleneck**

| Criterion | Assessment |
|-----------|-----------|
| Current complexity | 1544 lines, single file, no modules |
| Testability | Cannot unit-test DOM logic without a browser harness |
| Maintainability | Mixed concerns — state, UI, network, scoring all interleaved |
| Alternatives | React, Svelte, Vue (all require a build step) |

**Recommendation:** For the current personal-tool scope, vanilla JS is fine. For open-source, consider **Svelte** (no virtual DOM overhead, minimal bundle, excellent for a component-per-screen app) or splitting `app.js` into ES modules without a framework.

---

## 3. Missing Tools That Should Be Added

| Tool | Purpose | Priority |
|------|---------|----------|
| **TypeScript** | Type safety for server.js and app.js | High |
| **ESLint + Prettier** | Code style consistency | Medium |
| **Jest or Vitest** | Unit testing for scoring logic, parsers | High |
| **Playwright or Cypress** | E2E testing for the exam flow | Medium |
| **bats-core** | Shell script testing for kubectl wrapper | Medium |
| **Docker** | One-command setup, open-source distribution | High |
| **GitHub Actions or GitLab CI** | Automated test runs on PR | High |
| **Dependabot or Renovate** | Automatic dependency updates | Low |

---

## 4. Version Compatibility Matrix

| Node version | node-pty | Works? | Notes |
|-------------|----------|--------|-------|
| 18 LTS | 1.2.0-beta.11 | ✅ | Minimum supported |
| 20 LTS | 1.2.0-beta.11 | ✅ | Recommended |
| 22 LTS | 1.2.0-beta.11 | ✅ | Current latest LTS |
| 24 | 1.2.0-beta.11 | Unknown | Check native binding compatibility |

| macOS version | bash version | Issue |
|--------------|-------------|-------|
| macOS 12+ | 3.2 (system) | May fail on bash 4+ features |
| macOS 12+ with Homebrew | 5.x | Works correctly |
| Ubuntu 22+ | 5.x | Works correctly |
| Alpine Linux | 5.x (if installed) | Works if bash installed via apk |

---

## 5. Security Considerations in the Stack

| Component | Risk | Mitigation |
|-----------|------|-----------|
| `node-pty` spawning bash | Arbitrary command execution | Sandbox HOME + PATH override reduces blast radius |
| marked.js rendering | XSS if Markdown content is malicious | Content is author-controlled; low risk |
| `express.static` | Directory traversal | Express handles this; `/api` prefix avoids collision |
| PTY leak | Zombie processes | `pty.kill()` in WS close handler — verify this is called on all paths |
| No auth | Anyone on localhost can access | Acceptable for local tool; unacceptable for any hosted version |
| CDN dependencies | Supply chain attack | Vendor locally for production/hosted use |

---

## 6. Stack Verdict

| Layer | Current Choice | Verdict | Upgrade Path |
|-------|--------------|---------|-------------|
| Runtime | Node.js 18+ | ✅ Keep | Upgrade to v22 LTS |
| HTTP | Express 4 | ✅ Keep | Migrate to Express 5 in maintenance pass |
| WebSocket | ws | ✅ Keep | Add typed protocol |
| PTY | node-pty beta | 🟡 Keep, fix version pin | Pin to exact version |
| Terminal UI | xterm.js 5.3 CDN | 🟡 Vendor locally | Copy to `public/vendor/` |
| Markdown | marked 4.3 CDN | 🔴 Update | Upgrade to marked 14.x |
| Simulation | Bash scripts | 🟡 Keep short-term | Migrate to Node.js long-term |
| Frontend | Vanilla JS | 🟡 Keep short-term | Split into ES modules |
| Testing | None | 🔴 Add immediately | Vitest + bats-core |
| CI | None | 🔴 Add immediately | GitHub Actions |
| Containers | None | 🔴 Add for open-source | Dockerfile + docker-compose |
