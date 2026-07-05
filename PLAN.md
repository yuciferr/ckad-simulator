# Plan: Fix logical & UI/UX bugs across `exams/practice/`

## Context

The CKAD practice exams (10 topics, ~150 questions under `exams/practice/`) have accumulated
content-data bugs and two client bugs that make the simulator inconsistent and, in places,
self-contradicting. The user wants every practice `exam.json` / `answer.json` and the environment
setup to be logically coherent: question flow, answer acceptance, hints, optional paths, the
namespace a question expects, and the pre-provisioned state must all agree — with no runtime errors.

Three concrete symptoms were reported and confirmed:
1. A question says "create namespace X" but the sandbox **pre-creates X**, so the task is already done.
2. Hint panel shows literal `` ```bash `` text instead of a rendered code block.
3. The terminal panel only uses ~half the vertical height.

Decisions taken with the user:
- **Namespace-create bug → faithful fix**: do NOT pre-create a namespace a question asks to create;
  the student creates it (add a `createNamespace:false` flag, honored in the sandbox reset path).
- **Scope**: fix the identified concrete bugs, then run a **systematic scan** over all 10 topics for
  the same bug classes and fix what it finds. Not a line-by-line technical re-audit of all 150 answers.

## Root causes (verified)

| Area | File / location | Root cause |
|------|-----------------|-----------|
| Terminal half-height | `public/style.css:1364-1366` | A duplicate `.terminal-wrapper { position: relative; }` overrides the intended `position:absolute; inset:0` (lines 1000-1008), collapsing the wrapper to content height; FitAddon then locks xterm to that reduced height. |
| Stray CSS brace | `public/style.css:262` | Extra `}` after `.exam-card.practice .exam-card-badge` (tolerated, cosmetic). |
| Hint shows raw ```` ```bash ```` | `src/client/screens/exam-screen.ts:113-129` (`bindHintButton`) | Uses `hintEl.textContent` (no markdown) **and** a line heuristic that skips `**…**` lines and lands exactly on the `` ```bash `` fence delimiter. Every other renderer uses `marked.parse(...)`. |
| "Create namespace X" already satisfied | `src/sandbox/scenario.ts:101-116` (`resetQuestionScenario`, practice/no-manifests branch) | Pre-creates the question's assigned namespace via `kubectl create namespace ${ns}`. When the assigned ns is the very namespace the question tells the student to create, the task is pre-done. Assigned ns comes from `exam.json.namespace`, populated by `scripts/assign-practice-namespaces.js`. |
| Corrupted question bodies + `weight:0` | `configuration` Q3/Q4, `crd` Q3 | Body was mangled by a bad extraction: it begins with a truncated title + literal `\nweight: N\n\n` before the real prompt, and `weight` was left `0` instead of matching siblings (3 / 25). |
| Redundant/erroring answer step | `configuration` answer Q15 (`kubectl create ns one`), Q12 (`kubectl create ns limitrange`) | For pre-provisioned namespaces these `create ns` lines error `AlreadyExists` in the sandbox. |

## Scoring model context (so fixes stay correct)

Practice questions have **empty `criteria`**; scoring is derived at runtime by `src/client/scoring/practice.ts`:
- `extractPracticeCheckGroups()` parses the ```` ```bash ```` blocks in each **answer body** into expected
  command groups matched against terminal history → **answer bodies are the source of truth for grading**.
- `scoreNamespaceCheck()` additionally checks the student's work landed in the question's assigned namespace
  (skipped when ns is `default`).

Implications the fixes must respect:
- Keep answer ```` ```bash ```` blocks accurate — they are graded.
- For a `createNamespace:false` question, the student both creates ns X and works in it, so the namespace
  check still passes (resources land in X) and the command check sees `create namespace X`.

## Changes

### Phase A — Client UI/UX (source in `src/client` + `public`; then `npm run build`)

1. **Terminal height** — `public/style.css:1364-1366`: remove the duplicate
   `.terminal-wrapper { position: relative; }` block (the earlier `position:absolute; inset:0` already
   fills `.terminal-container` and provides the positioning context for `.scenario-overlay`).
   Also remove the stray `}` at `public/style.css:262`.
2. **Hint rendering** — rewrite `bindHintButton()` in `src/client/screens/exam-screen.ts`:
   - Derive the hint from `answer.body` by taking the first real command from its first ```` ```bash ````
     block (skip comment/empty lines); fall back to the first prose line that isn't `**…**` or a fence.
   - Render via `marked.parse(...)` into `hintEl.innerHTML` (matching `#questionBody` at line 183 and
     `review.ts`/`practice.ts`), so the hint is a properly formatted one-command snippet, never a raw fence.
   - `npm run build` regenerates `public/js/**` (never hand-edited).

### Phase B — Namespace-create logical fix (faithful, no pre-create)

3. **Sandbox** — `src/sandbox/scenario.ts` `resetQuestionScenario()` practice/no-manifests branch:
   read the question's optional `createNamespace` field (default `true`); when `false`, still delete for a
   clean slate but **skip** `kubectl create namespace ${ns}` and still mark it initialized so later
   questions sharing the segment don't re-delete the student-created namespace. Add a small registry helper
   to read the flag (reuse the same lookup path as `practiceQuestionNamespace`).
4. **Data** — set `"createNamespace": false` on the questions whose graded task is to create their assigned
   namespace: `core_concepts` Q1 (`mynamespace`), `configuration` Q12 (`limitrange`). (Q5 core_concepts
   "get YAML … without creating it" is a dry-run and correctly keeps `myns` pre-created for Q6+.)
5. **Assign script guard** — `scripts/assign-practice-namespaces.js`: preserve any existing
   `createNamespace` field when it rewrites `namespace` (so re-running the script never silently drops the
   flag), and add a header note. Only preserve — no fragile auto-detection.

### Phase C — Content data-corruption fixes

6. Reconstruct the mangled `body` fields from the clean `**Question:**` text already present in the matching
   answer body, and set the correct weight:
   - `configuration/exam.json` Q3 (body + `weight` 0→3), Q4 (body + `weight` 0→3).
   - `crd/exam.json` Q3 (body + `weight` 0→25).
7. Remove the redundant `kubectl create ns …` lines from `configuration/answer.json` Q12 and Q15 (or mark
   the ns as pre-provisioned) so the graded solution doesn't error in the sandbox.

### Phase D — Systematic scan across all 10 topics

Run a scripted audit and fix anything the same bug classes turn up (report findings first, fix in place):
- `weight: 0` anywhere (only `configuration`, `crd` known — confirm none else).
- Bodies containing the `\nweight:` extraction artifact (only `configuration`, `crd` known — confirm).
- Any question whose body says "create a namespace named/called X" **and** whose assigned `namespace` == X
  → candidate for `createNamespace:false` (beyond the two already known).
- `answer.json` answer count == `exam.json` question count per topic; every answer body has a solution
  block; no answer references a namespace the question/env never provides.

## Critical files

- `public/style.css` (terminal height, stray brace)
- `src/client/screens/exam-screen.ts` (`bindHintButton`) → rebuild to `public/js/**`
- `src/sandbox/scenario.ts` (`resetQuestionScenario` create-namespace branch)
- `scripts/assign-practice-namespaces.js` (preserve `createNamespace`)
- `exams/practice/core_concepts/{exam,answer}.json`, `exams/practice/configuration/{exam,answer}.json`,
  `exams/practice/crd/exam.json`
- Scan target: all `exams/practice/*/{exam,answer}.json`

## Verification

1. `npm run build` — TS compiles (server → `dist/`, client → `public/js/`).
2. `npm run validate:exams` and `npm run validate:scenarios` — pre-commit gate, must pass.
3. `npm run lint`.
4. `make up`; `curl -s http://localhost:3000/health | jq .cluster.ready` → `true`.
5. In the browser (per `verify` skill):
   - Terminal fills the full right-panel height (not half).
   - Open a practice question, click the hint button → renders a formatted command, not literal ```` ```bash ````.
   - Load `core_concepts` Q1: confirm `mynamespace` does **not** exist yet (`kubectl get ns mynamespace`
     → NotFound), create it + the pod, and confirm the question scores as passed.
   - Load `configuration` Q3/Q4 and `crd` Q3: confirm the question body reads cleanly (no `weight:` artifact).
6. Add a session log under `docs/dev/YYYY-MM-DD-session-N.md` and copy this plan to `PLAN.md` at repo root
   for the user, before committing (commit only when asked; never push).
