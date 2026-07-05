# kind Migration — Planning & Progress

> **Branch:** `kind-migration`  
> **Status:** ✅ **Migration complete** — see [14-migration-complete.md](./14-migration-complete.md)

---

## Document Index

| File | Content |
|------|---------|
| [00-overview.md](./00-overview.md) | Motivation, goals, summary |
| [01-current-vs-target-architecture.md](./01-current-vs-target-architecture.md) | Before/after architecture |
| [02-what-changes.md](./02-what-changes.md) | Component-by-component changes |
| [03-migration-phases.md](./03-migration-phases.md) | 6-phase implementation plan |
| [04-docker-compose-kind-setup.md](./04-docker-compose-kind-setup.md) | Docker/kind technical setup |
| [05-exam-scenarios-structure.md](./05-exam-scenarios-structure.md) | Scenario YAML format |
| [06-backend-changes.md](./06-backend-changes.md) | Backend TypeScript changes |
| [07-risks-and-mitigations.md](./07-risks-and-mitigations.md) | Risks and fixes |
| [08-quick-start.md](./08-quick-start.md) | Install and troubleshooting |
| [09-kubernetes-version-strategy.md](./09-kubernetes-version-strategy.md) | K8s v1.32.3 strategy |
| [10-implementation-progress.md](./10-implementation-progress.md) | Session log (initial) |
| [11-scenarios-cluster-evidence-and-polish.md](./11-scenarios-cluster-evidence-and-polish.md) | Q1–Q17 + evidence |
| [12-docker-kind-startup-fix.md](./12-docker-kind-startup-fix.md) | Startup fixes (Apple Silicon) |
| [13-writable-course-async-scenarios-practice.md](./13-writable-course-async-scenarios-practice.md) | Course + async + practice |
| [14-migration-complete.md](./14-migration-complete.md) | Final migration status |
| [15-practice-namespace-isolation.md](./15-practice-namespace-isolation.md) | **Practice namespace isolation, scoring signal, non-blocking prep UI** |

---

## TL;DR

**Before:** Bash kubectl simulation, read-only mock output, high maintenance.  
**After:** Docker + kind, real cluster, scenario YAMLs, cluster-based scoring.

```bash
make up
open http://localhost:3000
```

K8s version: `kindest/node:v1.32.3`
