#!/usr/bin/env node
/**
 * Validate mock exam kind scenarios under exams/mock/1/scenarios/.
 */
const fs = require('fs');
const path = require('path');

const SCENARIOS_DIR = path.join(__dirname, '..', 'exams', 'mock', '1', 'scenarios');
let errors = 0;
let warnings = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
  warnings++;
}

if (!fs.existsSync(SCENARIOS_DIR)) {
  fail(`Missing scenarios directory: ${SCENARIOS_DIR}`);
  process.exit(1);
}

const dirs = fs
  .readdirSync(SCENARIOS_DIR)
  .filter((d) => /^q\d+$/.test(d))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

for (const dir of dirs) {
  const qNum = dir.slice(1);
  const expectedNs = `exam-q${qNum}`;
  const dirPath = path.join(SCENARIOS_DIR, dir);
  const yamls = fs.readdirSync(dirPath).filter((f) => /\.ya?ml$/i.test(f));

  if (yamls.length === 0) {
    warn(`${dir}: no setup.yaml`);
    continue;
  }

  for (const yaml of yamls) {
    const content = fs.readFileSync(path.join(dirPath, yaml), 'utf-8');
    if (!content.includes(`name: ${expectedNs}`) && !content.includes(`namespace: ${expectedNs}`)) {
      warn(`${dir}/${yaml}: expected namespace reference ${expectedNs}`);
    }
    if (content.includes(': latest')) {
      warn(`${dir}/${yaml}: avoid :latest image tags`);
    }
  }

  const verify = path.join(dirPath, 'verify.sh');
  if (fs.existsSync(verify) && !(fs.statSync(verify).mode & 0o111)) {
    warn(`${dir}/verify.sh exists but is not executable`);
  }

  console.log(`OK  ${dir} (${yamls.length} manifest(s))`);
}

console.log(`\nScenarios checked: ${dirs.length}, errors: ${errors}, warnings: ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
