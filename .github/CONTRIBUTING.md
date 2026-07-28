# Contributing

Thanks for helping improve CKAD Simulator. Bug fixes, new exam questions, and better
scenarios are all welcome.

## Getting set up

```bash
git clone https://github.com/yuciferr/ckad-simulator.git
cd ckad-simulator
./install.sh          # Docker + kind cluster + app on http://localhost:3000
```

For work on the server or UI, run it directly against the cluster the installer created:

```bash
npm install
npm run dev           # builds, then node --watch server.js
```

`npm run dev` needs `SANDBOX_MODE=kind` and a reachable kubeconfig. The simplest path is
to keep the Compose stack running and iterate inside it with `make up`.

## Where things live

| Path | What it is |
|------|------------|
| `src/` | Server TypeScript → `dist/` |
| `src/client/` | Browser TypeScript → `public/js/` |
| `exams/mock/{id}/` | Mock exams: `exam.json`, `answer.json`, `scenarios/`, `course/` |
| `exams/practice/{slug}/` | Practice modules |
| `exams/manifest.json` | Registry and ordering for both |
| `scripts/` | Cluster init, question reset, content validators |
| `tests/` | Vitest unit tests |

`public/js/` and `dist/` are build output — never edit them by hand. Change `src/` and
run `npm run build`.

## Adding a practice module

1. Create `exams/practice/{slug}/exam.json` and `answer.json` — the shape is defined by
   `exams/schema.json` and `exams/answer.schema.json`.
2. Add `{slug}` to the `practice` array in `exams/manifest.json`.
3. Run `npm run assign:practice-namespaces` to allocate namespaces for the new questions.
4. Run `npm run validate:exams`, then check the module renders on the landing page.

Question bodies are Markdown. Answers carry both a written solution (`body`) and
declarative `checks` used for automatic scoring — prefer adding `checks` so the question
can be graded.

## Adding a mock exam scenario

Cluster state for a question is seeded from a manifest:

```
exams/mock/{id}/scenarios/q5/setup.yaml   # applied before the candidate reaches Q5
exams/mock/{id}/scenarios/q5/verify.sh    # optional — extra grading in review mode
exams/mock/{id}/course/p5/               # files seeded into /opt/course/p5/
```

Resources in `setup.yaml` must live in the `exam-q{N}` namespace. Run
`npm run validate:scenarios` afterwards.

Never build a namespace string by hand in code — go through `sanitizeNamespaceSegment()`
in `src/sandbox/scenario.ts`.

## Before you open a PR

There is no CI, so please run these locally:

```bash
npm run build              # must compile clean
npm run lint
npm test
npm run validate:exams     # required for any exam content change
npm run validate:scenarios # required for any scenario change
```

Then smoke test: landing page loads, an exam starts, the terminal accepts `kubectl get ns`.

## Pull requests

- Branch off `main`; one logical change per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`,
  `docs:`, `refactor:`, `chore:`.
- Explain *why* the change is needed in the commit body and PR description, not just what changed.
- Link the issue it closes.

For anything large — a new exam, a scoring change, an architectural shift — open an issue
first so we can agree on the approach before you write the code.

By contributing you agree that your work is licensed under the [MIT License](../LICENSE).
