# 15 — Practice Namespace Isolation & Non-Blocking Prep UI

> **Branch:** `kind-migration`
> **Status:** Done — practice modules now use real, isolated kind namespaces; a scoring criterion checks them; prep no longer freezes the UI.

---

## Summary

Continues the work started (uncommitted) in a prior session on this branch: mock exams already had per-question `exam-qN` namespaces, but `exams/practice/` was still effectively living in the pre-kind world — every non-scenario question shared the single `default` namespace, with no signal that a question's work landed in the "right" place, and starting an exam/practice session could make the UI feel frozen while kind provisioned resources in the background.

This session made practice namespace-isolated like mock already was, added a real "correct namespace" scoring signal, fixed a k8s-naming bug in the fallback path, and verified the non-blocking prep UI (built earlier, uncommitted) actually covers both mock and practice entry.

---

## What was done

### 1. Non-blocking exam/practice prep (verified, not new)
`showGlobalLoading()`/`hideGlobalLoading()` (`src/client/ui.ts`) cover the click-to-terminal gap for both mock and practice; the terminal itself shows a separate per-question `scenarioStatus` overlay while kind applies/deletes resources in the background (`src/ws/terminal.ts`, `src/sandbox/scenario.ts`). Confirmed `startExam()` (`src/client/screens/exam-screen.ts`) is generic across both exam groups and that `resetSandboxStateAsync` (`src/sandbox/reset.ts`) never blocks the HTTP response on cluster work — `prewarmFirstQuestionScenario` and `cleanupExamNamespaces` are both fire-and-forget.

### 2. Practice namespace isolation
Every practice question now resolves to a real namespace instead of `default`, via a new per-question `namespace` field in `exams/practice/*/exam.json`:

- Populated by the new `scripts/assign-practice-namespaces.js` (`npm run assign:practice-namespaces`).
- Uses **continuous segments, not a fixed-size bucket**: a new segment starts only when a question's body explicitly names a *different* namespace (e.g. "namespace called 'mynamespace'", "in the limitrange namespace"); everything else inherits the active segment, however long. This was a deliberate correction of the original fixed-bucket-of-5 design (already in `src/config.ts`'s `PRACTICE_NAMESPACE_GROUP_SIZE`) — a fixed window silently splits real chains longer than the window across two different namespaces. Concretely: `core_concepts` creates an nginx pod once (Q8) and spends the next several questions (Q9–Q15) inspecting/logging/exec'ing into that same pod; a 5-question bucket would put Q8 and Q11 in different, empty namespaces, making the pod the exercise depends on simply not exist where the student is looking.
- Modules with no explicit namespace anywhere (most of them) collapse to one `practice-<id>-g1` namespace for the whole module — isolated from other modules and from mock exams, which is the property that actually matters; internal collisions within one module are no worse than the pre-migration state (everything already shared `default`).
- `fallbackPracticeNamespace()` in `src/sandbox/scenario.ts` (fixed-bucket formula) is retained only as a defensive fallback for a question that's missing the field entirely — the script's output is the source of truth.
- Fixed a real bug in that fallback: several exam ids (`core_concepts`, `multi_container_pods`, `pod_design`) contain `_`, which is invalid in a k8s namespace name (RFC 1123 label). Added `sanitizeNamespaceSegment()`, mirrored in both `scenario.ts` and the script.

### 3. Namespace-correctness as a scoring signal
`scorePracticeQuestion()` (`src/client/scoring/practice.ts`) now includes `scoreNamespaceCheck()`: using the already-generic cluster-state evidence (`GET /api/session/evidence`, `initialNamespaceForQuestion`), it checks whether any resources actually exist in the question's assigned namespace and folds that into the score. Skipped when the resolved namespace is `default` (scenario-backed questions, where "stuff in default" isn't a meaningful signal).

### 4. Housekeeping
- `npm run assign:practice-namespaces` script added to `package.json`.
- `CLAUDE.md` created/updated to document the namespace model and the new script.

---

## Verified (not run: vitest, docker build)

```bash
npm run build              # tsc + client tsc — clean
npm run validate:exams     # 0 errors, pre-existing mock warnings only
npm run validate:scenarios # 19 scenarios, 0 errors/warnings
npm run lint               # clean
npx prettier --write <changed files>
```

Explicitly deferred to the user: `make up` / image rebuild + manual walkthrough in a browser, and `npm test` (vitest).

---

## What's left / open questions for next session

- **No real acceptance criteria for most practice questions.** `answer.json`'s `criteria` field exists in the schema but is unused dead weight — `scorePracticeQuestion` only ever parses bash blocks out of `answer.body` text and now also checks "any resource in the assigned namespace." There's no per-question check like mock's `scoreFromClusterState` (e.g. "is there a Deployment named X with 3 replicas"). Could be added incrementally, module by module, the same way mock's `verify.sh` pattern was rolled out (Q1, Q3, Q10, Q17 only, not all 17).
- **`scoreNamespaceCheck` is coarse.** It only checks "does *any* resource exist in the namespace," not "does *the specific resource this question asked for* exist." A student who did nothing but whose namespace still holds leftovers from an earlier question in the same segment would pass. Tightening this would need per-question expected-resource metadata (kind + name pattern), which doesn't exist yet.
- **Segment naming is best-effort, not exact.** The continuous-segment algorithm can mis-attribute a few trailing default-namespace questions to a preceding explicit namespace (e.g. `configuration` Q18–22 inherit `one` from Q15–17 even though they're actually unrelated secret exercises). Harmless functionally (self-consistent: whatever we assign becomes the terminal's real working namespace), just not perfectly intuitive if someone inspects `kubectl get ns` mid-session. Only worth revisiting if it ever needs to look clean in the UI, not just work.
- **No scenario setup for practice questions that assume pre-existing state**, aside from the two that already have one (`observability/q4`, `services/q9`). Swept all ten modules for language implying pre-seeded resources ("already running", "given", "pre-existing") — nothing else matched, but this was a text-search heuristic, not a full read of every question.
- **`npm run assign:practice-namespaces` must be re-run whenever `exams/practice/*/exam.json` questions are added, reordered, or reworded** (reordering renumbers segments; rewording can add/remove an explicit-namespace match). Nothing currently enforces this — a CI check or pre-commit hook could catch drift, but there's no CI in this repo yet (see 07-risks-and-mitigations.md).
- **Mock exam 2/3** — still no content, as already called out as explicitly out of scope in `14-migration-complete.md`.
