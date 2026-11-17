# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CKAD exam simulator: browser terminal (xterm.js → WebSocket → node-pty → bash) driving a real **kind** Kubernetes cluster. `SANDBOX_MODE=kind` is the only supported mode.

## Token optimization — use `rtk`, not native commands

- `rtk read <file>` instead of `cat`
- `rtk tree` / `rtk ls` instead of native `tree`/`ls`
- `rtk git <args>` instead of native `git log`/`diff`/`status`
- `rtk diff`, `rtk grep`, `rtk json` for their respective jobs
- Always prefer the `rtk` proxy over native commands to keep context clean.

## Commands

```bash
make up                    # docker compose up --build -d; first run creates the kind cluster (~60s)
make down / make logs      # stop / follow backend logs
make reset-q Q=3           # reset mock exam Q3's namespace + scenario
curl -s http://localhost:3000/health | jq .cluster.ready   # must be true after `make up`

npm run build              # tsc (server → dist/) && tsc -p src/client/tsconfig.json (client → public/js/)
npm run dev                # build then node --watch server.js
npm run lint                        # build:client, then eslint
npm run validate:exams               # checks exams/**/exam.json + answer.json shape
npm run validate:scenarios           # checks scenarios/qN/setup.yaml namespace refs
npm run assign:practice-namespaces   # regenerate exams/practice/*/exam.json `namespace` fields — rerun after adding/editing practice questions
npm test                             # vitest run — do NOT run this frequently, only when explicitly asked or finalizing a feature
```

## Git workflow

- Commit messages must be detailed and explain the *why*, not just the what.
- Pushing branches and opening PRs is allowed — agents working on a feature/fix branch (including in worktrees under `.claude/worktrees/`) may push that branch to `origin` and open a PR without asking first. Never force-push, and never push directly to `main`.
- **Before committing**, add a session log to `docs/dev/YYYY-MM-DD-session-N.md` (check the folder for the next N) covering: (1) what was just implemented/fixed, (2) what's remaining or next.

## Gotchas

- `public/js/**` is a gitignored build artifact mirroring `src/client/**` 1:1 — **never hand-edit it**, edit `src/client/` and run `npm run build`.
- `server.js` requires `./dist/*` — always `npm run build` (or `build:server`) before running the server directly; `npm run dev`/`prestart` do this automatically.
- Exam ids are used as k8s namespace segments; ids like `core_concepts`/`pod_design` contain `_`, invalid in a namespace name — always route through `sanitizeNamespaceSegment()` (`src/sandbox/scenario.ts`), never build a namespace string by hand.
- Practice questions don't have their own namespace by default — `src/sandbox/scenario.ts`'s `questionNamespace()` resolves it from the `namespace` field in `exam.json` (populated by `scripts/assign-practice-namespaces.js`, continuous-segment logic, not fixed-size buckets — see that script's header comment before changing it). Re-run the script after editing `exams/practice/*/exam.json`.
- Namespace cleanup on exam exit is explicit (`POST /api/sandbox/cleanup`, wired into `backToHome()`) — it is **not** implicit in the next reset. If you add a new "leave the exam" path in the client, call `cleanupSandbox()` from it.
- `resetSandboxStateAsync`'s prewarm-before-cleanup ordering in `src/sandbox/reset.ts` is deliberate (avoids a background delete racing a freshly-applied scenario) — read the comment there before reordering.
- `src/exam/registry.ts`'s `isSafeExamId`/`isPathWithinExamsDir` are the only sanctioned way to resolve an exam id to a path — never re-derive exam paths by hand (path traversal).
- There is no CI. Treat `npm run validate:exams` / `validate:scenarios` as the pre-commit gate for any exam content change.
