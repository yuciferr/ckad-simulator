#!/usr/bin/env node
/**
 * Validate all exam JSON files under exams/mock and exams/practice.
 * Usage: node scripts/validate-exams.js
 */

const fs = require('fs');
const path = require('path');
const { loadManifest, resolveExamPaths, loadExamFile, loadAnswerFile } = require('../dist/exam/registry');
const { extractNamespacesFromText } = require('../dist/exam/md-parser');

const MOCK_FIXTURES_DIR = path.join(__dirname, '../sandbox/etc/kubernetes/mock');

let errors = 0;
let warnings = 0;

function err(msg) {
  console.error(`❌ ${msg}`);
  errors += 1;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  warnings += 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

const CHECK_OPERATORS = ['exists', 'equals', 'contains', 'count', 'gte', 'has'];

/** Validate one answer question's `checks` array (the grading spec). */
function validateChecks(label, checks) {
  if (checks === undefined) {
    warn(`${label}: no checks defined (question is ungraded)`);
    return;
  }
  if (!Array.isArray(checks) || checks.length === 0) {
    err(`${label}: checks must be a non-empty array`);
    return;
  }
  checks.forEach((c, i) => {
    const where = `${label} check[${i}]`;
    if (!c || typeof c !== 'object') return err(`${where}: not an object`);
    if (typeof c.label !== 'string' || !c.label.trim()) err(`${where}: missing label`);
    if (c.weight !== undefined && typeof c.weight !== 'number') err(`${where}: weight must be a number`);

    const sources = ['resource', 'command', 'file'].filter((k) => c[k] !== undefined);
    if (sources.length !== 1) {
      return err(`${where}: needs exactly one of resource|command|file (found: ${sources.join(',') || 'none'})`);
    }

    if (c.resource !== undefined) {
      if (typeof c.resource !== 'string') err(`${where}: resource must be a string`);
      const ops = CHECK_OPERATORS.filter((op) => c[op] !== undefined);
      if (ops.length === 0) err(`${where}: resource check needs an operator (${CHECK_OPERATORS.join('|')})`);
      if (ops.length > 1) err(`${where}: resource check has conflicting operators: ${ops.join(',')}`);
      const needsPath = ['equals', 'contains', 'count', 'gte'].some((op) => c[op] !== undefined);
      if (needsPath && !c.path) err(`${where}: ${ops[0]} requires a "path"`);
    }

    if (c.command !== undefined) {
      if (typeof c.command !== 'object') return err(`${where}: command must be an object`);
      const { verb, resource, contains } = c.command;
      if (verb === undefined && resource === undefined && !contains) {
        err(`${where}: command needs at least one of verb|resource|contains`);
      }
      if (contains !== undefined && !Array.isArray(contains)) err(`${where}: command.contains must be an array`);
    }

    if (c.file !== undefined && typeof c.file !== 'string') err(`${where}: file must be a string`);
  });
}

function validateExamStructure(id, group) {
  const paths = resolveExamPaths(id);
  if (!paths) {
    err(`${group}/${id}: exam.json not found`);
    return;
  }

  let exam;
  try {
    exam = loadExamFile(paths);
  } catch (e) {
    err(`${group}/${id}/exam.json: invalid JSON — ${e.message}`);
    return;
  }

  if (!exam.title) warn(`${group}/${id}: missing title`);
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    err(`${group}/${id}: no questions`);
    return;
  }

  if (group === 'mock') {
    const weightSum = exam.questions.reduce((s, q) => s + (q.weight || 0), 0);
    if (weightSum !== 100) {
      err(`${group}/${id}: question weights sum to ${weightSum}% (expected 100%)`);
    }
  }

  for (const q of exam.questions) {
    if (!q.number || !q.title || q.body === undefined) {
      err(`${group}/${id}: question ${q.number || '?'} missing required fields`);
    }
  }

  if (!fs.existsSync(paths.answerPath)) {
    warn(`${group}/${id}: answer.json missing`);
    return;
  }

  let answers;
  try {
    answers = loadAnswerFile(paths);
  } catch (e) {
    err(`${group}/${id}/answer.json: invalid JSON — ${e.message}`);
    return;
  }

  const answerList = answers.answers || answers;
  if (!Array.isArray(answerList)) {
    err(`${group}/${id}/answer.json: answers must be an array`);
    return;
  }

  if (answerList.length !== exam.questions.length) {
    warn(`${group}/${id}: ${exam.questions.length} questions but ${answerList.length} answers`);
  }

  for (const a of answerList) {
    validateChecks(`${group}/${id} q${a.number}`, a.checks);
  }

  if (group === 'mock') {
    const namespaces = new Set();
    for (const q of exam.questions) {
      for (const ns of extractNamespacesFromText(q.body || '')) namespaces.add(ns);
    }
    for (const ns of namespaces) {
      const fixtureDir = path.join(MOCK_FIXTURES_DIR, ns);
      if (!fs.existsSync(fixtureDir)) {
        warn(`${group}/${id}: namespace '${ns}' has no mock fixture directory`);
      }
    }
  }

  ok(`${group}/${id} — ${exam.questions.length} questions`);
}

function main() {
  const manifest = loadManifest();

  if (!manifest.mock?.length && !manifest.practice?.length) {
    err('manifest.json is empty or missing');
    process.exit(1);
  }

  for (const id of manifest.mock || []) validateExamStructure(id, 'mock');
  for (const id of manifest.practice || []) validateExamStructure(id, 'practice');

  console.log(`\nValidation complete: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
