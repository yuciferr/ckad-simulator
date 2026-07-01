#!/usr/bin/env node
/**
 * Convert exam Markdown files to JSON format.
 * Usage: node scripts/convert-exams-to-json.js
 */

const fs = require('fs');
const path = require('path');
const { examFromMarkdown, answersFromMarkdown } = require('../src/exam/md-parser');
const { EXAMS_DIR, TOPIC_EXAM_ORDER } = require('../src/config');

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function convertLegacyMock() {
  for (const file of fs.readdirSync(EXAMS_DIR)) {
    const match = file.match(/^exam(\d+)\.md$/);
    if (!match) continue;

    const id = match[1];
    const examMd = path.join(EXAMS_DIR, `exam${id}.md`);
    const answerMd = path.join(EXAMS_DIR, `answer${id}.md`);
    const exam = examFromMarkdown(fs.readFileSync(examMd, 'utf-8'));
    exam.id = id;
    exam.group = 'mock';
    writeJson(path.join(EXAMS_DIR, `exam${id}.json`), exam);

    if (fs.existsSync(answerMd)) {
      const answers = answersFromMarkdown(fs.readFileSync(answerMd, 'utf-8'));
      answers.id = id;
      writeJson(path.join(EXAMS_DIR, `answer${id}.json`), answers);
    }
    console.log(`✓ mock exam${id}`);
  }
}

function convertPracticeModule(slug) {
  const examMd = path.join(EXAMS_DIR, slug, 'exam.md');
  if (!fs.existsSync(examMd)) return;

  const answerMd = path.join(EXAMS_DIR, slug, 'answer.md');
  const exam = examFromMarkdown(fs.readFileSync(examMd, 'utf-8'));
  exam.id = slug;
  exam.group = 'practice';
  writeJson(path.join(EXAMS_DIR, slug, 'exam.json'), exam);

  if (fs.existsSync(answerMd)) {
    const answers = answersFromMarkdown(fs.readFileSync(answerMd, 'utf-8'));
    answers.id = slug;
    writeJson(path.join(EXAMS_DIR, slug, 'answer.json'), answers);
  }
  console.log(`✓ practice ${slug}`);
}

function main() {
  convertLegacyMock();
  for (const slug of TOPIC_EXAM_ORDER) convertPracticeModule(slug);

  for (const entry of fs.readdirSync(EXAMS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (TOPIC_EXAM_ORDER.includes(entry.name)) continue;
    convertPracticeModule(entry.name);
  }
}

main();
