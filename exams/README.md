# Exam Content

All exam content is stored as **JSON**. Markdown source files are no longer used at runtime.

## Layout

```
exams/
├── schema.json          JSON Schema for exam.json
├── manifest.json        Registry: mock + practice module IDs and order
├── mock/
│   └── {id}/
│       ├── exam.json    Questions
│       └── answer.json  Scoring criteria + solutions
└── practice/
    └── {slug}/
        ├── exam.json
        └── answer.json
```

## Adding Content

1. Create `practice/{slug}/exam.json` and `answer.json` (see `schema.json`)
2. Add the slug to `manifest.json` → `practice` array
3. Run `npm run validate:exams`

## Import from CKAD-exercises

```bash
node scripts/convert-ckad-exercises.js /path/to/CKAD-exercises
npm run validate:exams
```
