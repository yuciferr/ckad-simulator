# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based CKAD (Certified Kubernetes Application Developer) exam simulator. A real **kind** Kubernetes cluster runs behind a browser terminal (xterm.js → WebSocket → node-pty → bash → kubectl), replacing an older bash-command-simulation approach. `SANDBOX_MODE=kind` is the only supported mode; `simulation` mode was removed with the legacy code (see `docs/kind-migration/14-migration-complete.md` for the full migration history).

```
Browser (xterm.js) ──WebSocket── Node/Express (node-pty) ── real kubectl/helm ── kind cluster (ckad-simulator)
```

## Commands

```bash
make up                    # docker compose up --build -d (auto-detects arm64); first run creates the kind cluster (~60s)
make down                  # stop containers
make cluster               # kubectl get nodes, from inside the backend container
make logs                  # follow backend logs
make reset-q Q=3           # reset mock exam Q3's namespace + scenario

npm run build              # tsc (server → dist/) && tsc -p tsconfig.client.json (client → public/js/)
npm run dev                # build then node --watch server.js (local dev without Docker; needs SANDBOX_MODE=kind + reachable kind cluster + kubectl 1.32+)
npm test                   # vitest run
npx vitest run tests/scoring.test.ts   # single test file
npm run lint               # build:client, then eslint public/js/ scripts/ server.js
npm run format             # prettier --write over src/, scripts/, tests/
npm run validate:exams     # build:server, then scripts/validate-exams.js — checks exams/**/exam.json + answer.json shape
npm run validate:scenarios # scripts/validate-scenarios.js — checks scenarios/qN/setup.yaml namespace refs, warns on :latest tags
npm run assign:practice-namespaces  # regenerate the per-question `namespace` field in exams/practice/*/exam.json — rerun after adding/editing practice questions
```

There is no CI. Before calling a change to `src/`, `exams/`, or the Docker/kind stack done, run the startup contract from `docs/kind-migration/14-migration-complete.md`:

```bash
make up
curl -s http://localhost:3000/health | jq .cluster.ready   # must be true
make reset-q Q=1
npm run validate:scenarios
```

## Architecture

### Server build split
Two separate `tsc` projects compile from one `src/` tree:
- `tsconfig.json` — `src/**` except `src/client`, compiles to `dist/` (commonjs). `server.js` at the repo root requires `./dist/create-app`, `./dist/config`, etc. — always run `npm run build` (or `build:server`) before running the server directly, `npm run dev`/`prestart` handle this automatically.
- `tsconfig.client.json` — `src/client/**` only, compiles to `public/js/` (ES2020 modules, browser). `public/js/*.js`, `public/index.html`, `public/style.css` are build artifacts / hand-edited static files respectively — **`public/js/**` mirrors `src/client/**` 1:1 and must be regenerated via `build:client`, never hand-edited**.

### Request/data flow
- `src/create-app.ts` wires Express routes (`routes/exams.ts`, `routes/session.ts`, `routes/health.ts`) and attaches the terminal WebSocket (`src/ws/terminal.ts`) to one `http.Server`.
- `src/exam/registry.ts` is the sole reader of exam content on disk: resolves an exam id to `exams/mock/<id>/` or `exams/practice/<slug>/`, and loads `exam.json`/`answer.json`. `isSafeExamId` + `isPathWithinExamsDir` guard against path traversal — any new code that resolves exam ids by hand must reuse these, not re-derive paths.
- `src/sandbox/scenario.ts` is the core per-question lifecycle: resolves each question's namespace and scenario dir, applies `scenarios/qN/setup.yaml` via kubectl on first visit (`ensureQuestionScenario`, cached in `loadedScenarioKeys`/`scenarioPromises` so re-entering a question doesn't reapply), and cleans up namespaces on exam reset (`cleanupExamNamespaces`). `src/sandbox/reset.ts` drives whole-exam reset (workspace + namespaces) and prewarms Q1's scenario synchronously so a background cleanup can't race a delete against a freshly-applied scenario — namespace ordering here is deliberate, see the comments in that file before touching it.
- `src/sandbox/verify.ts` runs `scenarios/qN/verify.sh <namespace>` when present (exit code = pass/fail) — used by review-mode auto-scoring, not exhaustive for every question (see "Explicitly out of scope" in the migration doc).
- `src/sandbox/course.ts` copies exam course seed files (`exams/mock/1/course/pN/`) into a writable sandbox workspace on exam start, since the exams dir itself is mounted read-only into the backend container.
- `src/ws/terminal.ts` spawns one PTY per open question tab, keyed by `questionId`, with `INITIAL_NAMESPACE` env baked in from `initialNamespaceForQuestion`; kind-mode scenario application happens async after the PTY is already usable, streaming `scenarioStatus` messages back over the same socket so the terminal isn't blocked on cluster prep.

### Namespace model (mock vs. practice)
- **Mock exam**: every question gets its own isolated namespace `exam-q{N}` (`MOCK_SCENARIO_NAMESPACE_PREFIX`), always backed by a scenario manifest.
- **Practice**: a question resolves to `default` only if it has its own `scenarios/qN/setup.yaml` (e.g. `observability/q4`, `services/q9`, which seed their own namespaces directly in the YAML). Every other practice question carries a per-question `namespace` field in `exam.json`, populated by `scripts/assign-practice-namespaces.js`. That script walks each module's questions in order as **continuous segments, not a fixed-size window**: a new segment starts only when a question explicitly names a *different* namespace than the currently-active one (e.g. "namespace called 'mynamespace'", "in the limitrange namespace"); everything else inherits the active segment, however long that run is — deliberately not capped, since some modules chain a dozen-plus questions against the same pod (create it, then inspect/log/exec into it repeatedly) and a fixed bucket size would silently split that chain across namespaces the pod was never actually created in. Modules with no explicit namespace mentions at all (most of them) end up as one `practice-<id>-g1` namespace for the whole module — isolated from other modules and from mock exams, which is the property that actually matters. `src/sandbox/scenario.ts`'s `fallbackPracticeNamespace()` (a fixed `PRACTICE_NAMESPACE_GROUP_SIZE`-question bucket) is only a defensive fallback for a question missing the field entirely — the script's output is the source of truth. Keep `sanitizeNamespaceSegment()` in scenario.ts in sync with the copy in the script (exam ids like `core_concepts` contain `_`, invalid in a k8s namespace name).
- **Namespace-correctness as a scoring signal**: `src/client/scoring/practice.ts`'s `scoreNamespaceCheck()` treats "resources exist in this question's assigned namespace" (from the cluster-state evidence at `GET /api/session/evidence`, generic across mock/practice via `initialNamespaceForQuestion`) as one more auto-check contributing to a practice question's score, skipped when the resolved namespace is `default`.

### Frontend
Vanilla TS (no framework) compiled straight to browser ES modules. `src/client/state.ts` holds one mutable `AppState` singleton; `src/client/router.ts` maps that state to/from `history.pushState` URLs (`/exam/:id`, `/exam/:id/q/:n`, `/exam/:id/review`, `/exam/:id/summary`) so refreshing mid-exam works. `src/client/screens/` holds the three screens (landing, exam, review); `src/client/scoring/{mock,practice}.ts` implement the two different auto-scoring strategies — mock scores from cluster-state evidence (`GET /api/session/evidence`) matched against `criteria` heuristics, practice scores by normalizing shell history against `answer.json` command text (with a k8s alias table for `po`/`pod`/`pods` etc.).

### Adding/editing exam content
- Exams are pure JSON + optional scenario YAML, no code changes needed for new questions: `exams/{mock,practice}/<id>/{exam.json,answer.json}`, referenced from `exams/manifest.json`.
- Mock scenario manifests must use the `exam-q{N}` namespace; run `npm run validate:scenarios` after any scenario edit, and `npm run validate:exams` after any `exam.json`/`answer.json` edit.
- `scripts/sync-kind-namespaces.js` is a one-off helper that was used to rewrite mock exam 1's original themed namespace names (pluto, sun, earth, ...) to `exam-qN` — reference for the pattern if another exam ever needs the same bulk rename, not part of the normal workflow.

### Docker/kind specifics
- `kind-init` service creates the cluster via the host Docker socket (mounted `/var/run/docker.sock`) and writes a shared kubeconfig volume; `backend` waits on it (`service_completed_successfully`) and mounts that kubeconfig read-only. The kind control-plane container appears *outside* the compose project in `docker ps`/Docker Desktop — this is expected, not a misconfiguration.
- `docker/kind-init.Dockerfile` / `backend.Dockerfile` both take a `TARGETARCH` build arg; the `Makefile` sets it from `uname -m` so Apple Silicon (`arm64`) works without manual flags.
