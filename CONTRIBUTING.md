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
src/              Server modules (routes, exam registry, sandbox, WebSocket)
public/js/        Frontend ES modules (app, scoring, terminal UI)
exams/            Exam content (JSON primary, Markdown source)
sandbox/          Simulated kubectl/helm environment
scripts/          Content conversion utilities
docs/             Technical documentation
```

## Adding a Practice Module

1. Create `exams/<slug>/exam.md` and `answer.md` (see existing modules for format)
2. Run `npm run convert:exams` to generate JSON files
3. Start the server and verify the module appears on the landing page

### Exam JSON Format

Primary runtime format is JSON (`exam.json`, `answer.json`). Schema: `exams/schema.json`.

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

After adding fixtures, reset the sandbox by starting a new exam session.

## Commit Guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Reference GitLab issues with `#<number>` when applicable
- Keep PRs focused — one logical change per PR

## Pull Request Checklist

- [ ] Mock exam weights sum to 100%
- [ ] All `context:` namespaces have fixture directories (if pre-seeded resources needed)
- [ ] `npm run convert:exams` run after Markdown content changes
- [ ] Server starts without errors (`npm start`)
- [ ] Manual smoke test: start exam → terminal works → navigate questions

## Code Style

- Match existing patterns in surrounding files
- Server: CommonJS modules in `src/`
- Frontend: ES modules in `public/js/`
- Shell scripts: bash with quoted variables

## Questions?

See `docs/` for architecture, onboarding, and roadmap details.
