#!/usr/bin/env node
/**
 * Validate kind scenarios under exams/mock and exams/practice.
 */
const fs = require('fs');
const path = require('path');

const EXAMS_DIR = path.join(__dirname, '..', 'exams');
let errors = 0;
let warnings = 0;
let checked = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
  warnings++;
}

function validateScenarioDir(label, dirPath, expectedNs) {
  if (!fs.existsSync(dirPath)) return;

  const yamls = fs.readdirSync(dirPath).filter((f) => /\.ya?ml$/i.test(f));
  if (yamls.length === 0) {
    warn(`${label}: no setup.yaml`);
    return;
  }

  for (const yaml of yamls) {
    const content = fs.readFileSync(path.join(dirPath, yaml), 'utf-8');
    if (expectedNs && !content.includes(`name: ${expectedNs}`) && !content.includes(`namespace: ${expectedNs}`)) {
      warn(`${label}/${yaml}: expected namespace reference ${expectedNs}`);
    }
    if (content.includes(': latest')) {
      warn(`${label}/${yaml}: avoid :latest image tags`);
    }
  }

  const verify = path.join(dirPath, 'verify.sh');
  if (fs.existsSync(verify) && !(fs.statSync(verify).mode & 0o111)) {
    warn(`${label}/verify.sh exists but is not executable`);
  }

  console.log(`OK  ${label} (${yamls.length} manifest(s))`);
  checked++;
}

function validateMockExam(examId) {
  const scenariosDir = path.join(EXAMS_DIR, 'mock', examId, 'scenarios');
  if (!fs.existsSync(scenariosDir)) {
    fail(`Missing scenarios directory: ${scenariosDir}`);
    return;
  }

  for (const dir of fs
    .readdirSync(scenariosDir)
    .filter((d) => /^q\d+$/.test(d))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))) {
    const qNum = dir.slice(1);
    validateScenarioDir(`${dir}`, path.join(scenariosDir, dir), `exam-q${qNum}`);
  }
}

function validatePracticeModule(slug) {
  const scenariosDir = path.join(EXAMS_DIR, 'practice', slug, 'scenarios');
  if (!fs.existsSync(scenariosDir)) return;

  for (const dir of fs
    .readdirSync(scenariosDir)
    .filter((d) => /^q\d+$/.test(d))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))) {
    validateScenarioDir(`${slug}/${dir}`, path.join(scenariosDir, dir), null);
  }
}

const manifestPath = path.join(EXAMS_DIR, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  for (const id of manifest.mock || ['1']) {
    validateMockExam(String(id));
  }
  for (const slug of manifest.practice || []) {
    validatePracticeModule(slug);
  }
} else {
  validateMockExam('1');
}

console.log(`\nScenarios checked: ${checked}, errors: ${errors}, warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
