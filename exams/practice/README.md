# Practice modules — kind scenario layout

Practice modules use the **default** namespace unless a question has manifests under `scenarios/qN/`.

```
exams/practice/{module}/
├── exam.json
├── answer.json
└── scenarios/
    └── qN/
        └── setup.yaml   # optional — applied on first visit to question N
```

When `setup.yaml` exists, the backend runs `kubectl delete -f` then `kubectl apply -f` in the background (terminal opens immediately).

Modules with scenarios today:

| Module | Question | Purpose |
|--------|----------|---------|
| observability | Q4 | Failing liveness probes in qa/alan/test/production |
| services | Q9 | nginx Deployment + Service for NetworkPolicy lab |

Other modules work in `default` — student creates all resources (matches CKAD practice exercises).
