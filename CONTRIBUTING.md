# Contributing to CKAD Simulator

Thank you for contributing! This guide covers how to add content, run the project locally, and submit changes.

## Prerequisites

- Node.js 18+ (20 LTS recommended)
- bash 4+ (`brew install bash` on macOS)
- Optional: Docker for containerized setup

## Quick Start

```bash
git clone <repository-url>
cd ckad-simulator
npm install
npm start
# open http://127.0.0.1:3000
```

**Docker:**

```bash
docker compose up --build
# open http://localhost:3000
```

## Project Structure

```
src/              Server modules (TypeScript → dist/)
public/js/        Frontend ES modules (app, screens, terminal, scoring)
exams/            Exam content (JSON only)
  mock/{id}/      Mock exams
  practice/{slug}/ Practice modules
  manifest.json   Registry and ordering
sandbox/          Simulated kubectl/helm environment
scripts/          Content conversion and validation utilities
docs/             Technical documentation
```

## Adding a Practice Module

1. Create `exams/practice/{slug}/exam.json` and `answer.json` (see `exams/schema.json`)
2. Add the slug to `exams/manifest.json` → `practice` array
3. Run `npm run validate:exams`
4. Start the server and verify the module appears on the landing page

### Exam JSON Format

Schema: `exams/schema.json`. See `exams/README.md` for layout.

```json
{
  "id": "core_concepts",
  "title": "Core Concepts",
  "duration": 90,
  "passPercentage": 66,
  "group": "practice",
  "questions": [
    {
      "number": 1,
      "title": "Pod Creation",
      "weight": 5,
      "context": "",
      "body": "Markdown question body..."
    }
  ]
}
```

## Adding Mock Exam Fixtures

For mock exams, pre-seeded cluster state lives in `sandbox/etc/kubernetes/mock/<namespace>/`.

Required files depend on the question — typically `pods.txt`, `deploy.txt`, `services.txt` in kubectl output format.

After adding fixtures, run `npm run validate:exams` and reset the sandbox by starting a new exam session.

## Import from CKAD-exercises

```bash
node scripts/convert-ckad-exercises.js /path/to/CKAD-exercises
npm run validate:exams
```

## Commit Guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Reference GitLab issues with `#<number>` when applicable
- Keep PRs focused — one logical change per PR

## PR Checklist

- [ ] `npm run build` succeeds
- [ ] `npm run validate:exams` passes
- [ ] Manual smoke test: landing page loads, exam starts, terminal works
- [ ] New exam content added to `manifest.json`
