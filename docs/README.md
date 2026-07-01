# CKAD Simulator — Technical Documentation

> **Status:** Living document — last updated July 2026  
> **Purpose:** Developer memory bank, onboarding guide, architectural reference, and open-source roadmap foundation.

This folder contains the complete technical documentation for the **CKAD Simulator** project — a browser-based, locally-run Kubernetes certification practice environment.

---

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [Current State Analysis](./01-current-state-analysis.md) | What exists today, completeness score, known gaps |
| 02 | [Architecture Review](./02-architecture-review.md) | Component diagram, data flows, design decisions |
| 03 | [Tech Stack Evaluation](./03-tech-stack-evaluation.md) | Dependencies, version choices, trade-offs |
| 04 | [Best Practices Assessment](./04-best-practices-assessment.md) | Code quality, security model, testing coverage |
| 05 | [Improvement Areas](./05-improvement-areas.md) | Weaknesses, bugs, refactoring opportunities |
| 06 | [Scalability & Extensibility](./06-scalability-extensibility.md) | Content growth, multi-cert support, plugin model |
| 07 | [Onboarding & Setup Guide](./07-onboarding-setup-guide.md) | Developer setup, project walkthrough, contribution guide |
| 08 | [Future Roadmap](./08-future-roadmap.md) | Feature ideas, open-source transformation plan |

---

## Quick Project Summary

| Property | Value |
|----------|-------|
| **Type** | Local web app (no cloud dependency) |
| **Runtime** | Node.js ≥ 18 |
| **Frontend** | Vanilla JS + xterm.js |
| **Shell** | Bash via node-pty |
| **Content** | 17 mock exam questions + ~150 practice questions |
| **Certifications covered** | CKAD (primary); CKA, CKS planned |
| **CI/CD** | None yet |
| **Tests** | Minimal (1 shell smoke test) |
| **Open-source ready** | Partially — needs Dockerfile, CI, fixture completion |

---

## How to Read This Docs

- Start with **[01 — Current State](./01-current-state-analysis.md)** if you are new to the project.
- Jump to **[02 — Architecture](./02-architecture-review.md)** if you need to understand the system internals.
- Use **[07 — Onboarding](./07-onboarding-setup-guide.md)** to get the project running and start contributing.
- Consult **[08 — Roadmap](./08-future-roadmap.md)** before starting any significant new feature.
