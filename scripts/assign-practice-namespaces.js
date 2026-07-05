#!/usr/bin/env node
/**
 * Populate the per-question `namespace` field on every exams/practice/<id>/exam.json
 * question, so each practice question resolves to a real, isolated kind namespace
 * instead of everything piling into `default` (see src/sandbox/scenario.ts
 * questionNamespace()/practiceQuestionNamespace()).
 *
 * Questions are walked in order and grouped into continuous segments, not a
 * fixed-size window: a new segment starts only when a question explicitly
 * names a *different* namespace than the one currently active (e.g.
 * "namespace called 'mynamespace'", "in the limitrange namespace",
 * "namespace `one`"); every other question inherits the active segment's
 * name, however long that run turns out to be. This matters because several
 * modules have chains longer than any fixed bucket size would allow — e.g.
 * core_concepts creates an nginx pod once and then spends the next dozen
 * questions inspecting/logging/exec'ing into that same pod, all of which
 * must resolve to the same namespace or the pod simply won't be there.
 * Leading questions with no explicit namespace yet get a synthetic
 * `practice-<id>-g<segment>` name (mirrors the shape of the runtime fallback
 * in src/sandbox/scenario.ts's fallbackPracticeNamespace(), used only if this
 * field is ever missing — this script is the source of truth).
 *
 * This script ONLY sets `q.namespace` — it mutates each existing question
 * object in place and re-serializes the whole exam, so any other per-question
 * fields (notably `createNamespace: false`, which tells the sandbox NOT to
 * pre-create a namespace the question tasks the student with creating — see
 * src/sandbox/scenario.ts) are preserved across runs. Never rebuild question
 * objects from scratch here or those flags would be silently dropped.
 *
 * Run after editing any exams/practice/<id>/exam.json:
 *   node scripts/assign-practice-namespaces.js
 */
const fs = require('fs');
const path = require('path');

const PRACTICE_DIR = path.join(__dirname, '..', 'exams', 'practice');

// Mirrors sanitizeNamespaceSegment() in src/sandbox/scenario.ts — keep in sync.
function sanitizeNamespaceSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const STOPWORDS = new Set([
  'this',
  'that',
  'the',
  'a',
  'an',
  'new',
  'all',
  'same',
  'its',
  'such',
  'any',
  'some',
  'my',
  'your',
  'our',
  'and',
  'is',
  'are',
  'for',
  'to',
  'in',
  'on',
  'of',
  'with',
  'without',
  'called',
  'named',
  'each',
  'every',
]);

const EXPLICIT_PATTERNS = [
  /\bnamespace\s+(?:called|named)\s+[`'"]?([a-zA-Z][\w-]*)[`'"]?/i,
  /\bnamespace\s+[`'"]([a-zA-Z][\w-]*)[`'"]/i,
  /\bin\s+(?:the\s+)?([a-zA-Z][\w-]*)\s+namespace\b/i,
  /\bnamespace\s+([a-zA-Z][\w-]*)/i,
];

function extractExplicitNamespace(body) {
  for (const re of EXPLICIT_PATTERNS) {
    const m = body.match(re);
    if (m && m[1] && !STOPWORDS.has(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  }
  return null;
}

function assignNamespaces(examId, questions) {
  const sanitizedId = sanitizeNamespaceSegment(examId);
  let segmentIndex = 0;
  let currentName = null;

  for (const q of questions) {
    const explicit = extractExplicitNamespace(q.body || '');

    if (explicit && explicit !== currentName) {
      segmentIndex += 1;
      currentName = explicit;
    } else if (!explicit && currentName === null) {
      segmentIndex += 1;
      currentName = `practice-${sanitizedId}-g${segmentIndex}`;
    }

    q.namespace = currentName;
  }
}

function processExam(examId) {
  const examPath = path.join(PRACTICE_DIR, examId, 'exam.json');
  if (!fs.existsSync(examPath)) return;

  const exam = JSON.parse(fs.readFileSync(examPath, 'utf-8'));
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) return;

  assignNamespaces(examId, exam.questions);

  fs.writeFileSync(examPath, JSON.stringify(exam, null, 2) + '\n', 'utf-8');
  const summary = exam.questions.map((q) => `q${q.number}=${q.namespace}`).join(', ');
  console.log(`${examId}: ${summary}`);
}

const examIds = fs
  .readdirSync(PRACTICE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const examId of examIds) processExam(examId);
