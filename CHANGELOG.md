# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-02

### Added

- Browser-based CKAD exam simulator with PSI-style split-pane UI (question + live terminal)
- Mock exam mode with timed countdown, flagging, and weighted review scoring
- Practice module mode with per-question Check Answer and auto-scoring heuristics
- Simulated `kubectl`, `helm`, and bash environment with sandbox isolation
- JSON-only exam content under `exams/mock/` and `exams/practice/` with `manifest.json`
- TypeScript server (`src/` → `dist/`) and TypeScript frontend (`src/client/` → `public/js/`)
- Session persistence and practice progress tracking via localStorage
- Exam validator CLI (`npm run validate:exams`)
- Unit tests for exam registry, md-parser, and practice scoring (`npm test`)
- Shell smoke tests for kubectl sandbox (`npm run test:shell`)
- Health endpoint (`GET /health`)
- Docker support (`docker compose up --build`)
- MIT License and CONTRIBUTING guide

### Changed

- Migrated exam content from Markdown to JSON (single runtime format)
- Modularized server into routes, exam registry, sandbox, WebSocket, and terminal capture
- Modularized frontend into screens, terminal, timer, API, and scoring modules

### Security

- Path traversal protection on exam API endpoints
- Default bind to `127.0.0.1` (override with `HOST` env)
- Sandbox layers: `KUBECONFIG=/dev/null`, PATH wrapper, HOME redirect, cd guard

### Fixed

- Mock exam question weights sum to 100%
- SSH implementation conflict (`bin/ssh` removed; `.bashrc` function only)
- Earth Q3 fixture/answer naming consistency
- Frontend module import paths (landing page load regression)

[1.0.0]: https://github.com/yucifer/ckad-simulator/releases/tag/v1.0.0
