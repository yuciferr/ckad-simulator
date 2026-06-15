#!/usr/bin/env node
/**
 * Normalizes exams answer.md files to a single alternative format:
 *
 * - **Alternatively:** before optional bash blocks (different approach, not required)
 * - # or          — equivalent command variants inside bash (pick one, same goal)
 * - # or, text    — OR split with short description
 * - # step: text  — procedural hint within a path (not scored)
 * - # note: text  — informational comment (not scored)
 */

const fs = require('fs');
const path = require('path');

const EXAMS_DIR = path.join(__dirname, '../exams');

const PROSE_ALT_PATTERNS = [
  /^Alternatively[^:\n]*:?\s*$/i,
  /^Or just in one line:?\s*$/i,
  /^or,\s*do something like:?\s*$/i,
  /^or,\s*$/i,
];

const STEP_COMMENT_PATTERNS = [
  [/^#\s*and then,?\s*(.+)$/i, '# step: $1'],
  [/^#\s*create\s+(?:a\s+)?(.+)$/i, '# step: create $1'],
  [/^#\s*see\s+(?:it|the\s+.+)$/i, '# step: verify output'],
  [/^#\s*apply\s+it\s+and\s+then\s+see\s+the\s+logs$/i, '# step: apply and check logs'],
  [/^#\s*get\s+all\s+the\s+pods$/i, '# step: list pods'],
  [/^#\s*let's\s+(.+)$/i, '# step: $1'],
  [/^#\s*change\s+the\s+(.+)$/i, '# step: change the $1'],
  [/^#\s*add\s+this\s+section\s+(.+)$/i, '# step: add section to spec'],
];

function normalizeProseAlternatives(text) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (PROSE_ALT_PATTERNS.some((re) => re.test(trimmed))) {
        return '**Alternatively:**';
      }
      return line;
    })
    .join('\n');
}

function normalizeOrComment(line) {
  const trimmed = line.trim();

  if (/^#\s*OR\b/i.test(trimmed)) {
    return '# or';
  }

  if (/^#\s*or\s+edit\b/i.test(trimmed)) {
    return '# or';
  }

  if (/^#\s*or\s+you\s+can\b/i.test(trimmed)) {
    return '# or';
  }

  if (/^#\s*alternatively\b/i.test(trimmed)) {
    return '# or';
  }

  if (/^#\s*or\s*,?\s*$/i.test(trimmed)) {
    return '# or';
  }

  if (/^#\s*or\s*,/i.test(trimmed)) {
    return trimmed.replace(/^#\s*or\s*,?\s*/i, '# or, ');
  }

  if (/^#\s*or\b/i.test(trimmed)) {
    return '# or';
  }

  return line;
}

function normalizeStepComment(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) return line;
  if (/^#\s*or\b/i.test(trimmed)) return line;

  for (const [re, repl] of STEP_COMMENT_PATTERNS) {
    if (re.test(trimmed)) {
      return trimmed.replace(re, repl);
    }
  }

  if (/^#\s*you\s+could\s+also\s+(.+)$/i.test(trimmed)) {
    return trimmed.replace(/^#\s*/i, '# note: ');
  }

  if (/^#\s*previous\s+command/i.test(trimmed)) {
    return trimmed.replace(/^#\s*/i, '# note: ');
  }

  return line;
}

function normalizeBashComment(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) return line;
  if (/^#\s*or\s*(?:$|,)/i.test(trimmed)) return line;
  if (/^#\s*(step:|note:)/i.test(trimmed)) return line;
  // YAML / editor fragments — leave as-is
  if (/^#\s*[-\w]+:/.test(trimmed) || /^#\s{2,}-/.test(trimmed)) return line;
  if (/^#\s*(cat|exit|vim|vi)\b/i.test(trimmed)) return line;

  const body = trimmed.replace(/^#\s*/, '');
  const lower = body.toLowerCase();

  if (/^(tip:|bear in mind|make sure|check if|result:|also\.\.\.|will have)/i.test(body)) {
    return `# note: ${body}`;
  }
  if (/^(cleanup|wait|then$|observe|try hitting|you can)/i.test(lower)) {
    return `# note: ${body}`;
  }
  if (/^(get |apply |execute |connect |run |change |view |create the)/i.test(body)) {
    return `# step: ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  }

  return `# note: ${body}`;
}

function normalizeBashBlock(content) {
  return content
    .split('\n')
    .map((line) => normalizeOrComment(line))
    .map((line) => normalizeStepComment(line))
    .map((line) => normalizeBashComment(line))
    .join('\n');
}

function normalizeAnswerContent(text) {
  let out = normalizeProseAlternatives(text);

  out = out.replace(/```bash\n([\s\S]*?)```/gi, (_, block) => {
    return '```bash\n' + normalizeBashBlock(block) + '```';
  });

  // Collapse duplicate blank lines around **Alternatively:**
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}

function main() {
  const files = fs
    .readdirSync(EXAMS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(EXAMS_DIR, d.name, 'answer.md'))
    .filter((f) => fs.existsSync(f));

  for (const file of files) {
    const before = fs.readFileSync(file, 'utf-8');
    const after = normalizeAnswerContent(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      console.log('✓', path.relative(EXAMS_DIR, file));
    }
  }

  console.log(`\nNormalized ${files.length} answer files`);
}

if (require.main === module) {
  main();
}

module.exports = { normalizeAnswerContent };
