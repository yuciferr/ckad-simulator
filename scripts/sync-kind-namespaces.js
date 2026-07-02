#!/usr/bin/env node
/**
 * Sync mock exam 1 themed namespace names to kind scenario namespaces (exam-qN).
 * Run after editing exam.json / answer.json sources: node scripts/sync-kind-namespaces.js
 */
const fs = require('fs');
const path = require('path');

const EXAM_DIR = path.join(__dirname, '..', 'exams', 'mock', '1');
const FILES = ['exam.json', 'answer.json'];

const NS_MAP = [
  ['pluto', 'exam-q1'],
  ['sun', 'exam-q2'],
  ['earth', 'exam-q3'],
  ['moon', 'exam-q4'],
  ['neptune', 'exam-q5'],
  ['mercury', 'exam-q6'],
  ['mars', 'exam-q7'],
  ['venus', 'exam-q8'],
  ['jupiter', 'exam-q9'],
  ['saturn', 'exam-q10'],
  ['uranus', 'exam-q11'],
  ['titan', 'exam-q12'],
  ['io', 'exam-q13'],
  ['europa', 'exam-q14'],
  ['callisto', 'exam-q15'],
  ['ganymede', 'exam-q16'],
  ['pandora', 'exam-q17'],
];

function replaceNamespaces(text) {
  let out = text;
  for (const [oldNs, newNs] of NS_MAP) {
    const patterns = [
      [new RegExp(`Namespace \\\`${oldNs}\\\``, 'g'), `Namespace \`${newNs}\``],
      [new RegExp(`namespace \\\`${oldNs}\\\``, 'g'), `namespace \`${newNs}\``],
      [new RegExp(`-n ${oldNs}\\b`, 'g'), `-n ${newNs}`],
      [new RegExp(`namespace: ${oldNs}\\b`, 'g'), `namespace: ${newNs}`],
      [new RegExp(`in namespace ${oldNs}\\b`, 'gi'), `in namespace ${newNs}`],
      [new RegExp(`in Namespace ${oldNs}\\b`, 'g'), `in Namespace ${newNs}`],
      [new RegExp(`namespace ${oldNs}\\b`, 'g'), `namespace ${newNs}`],
      [new RegExp(`--namespace ${oldNs}\\b`, 'g'), `--namespace ${newNs}`],
      [new RegExp(`${oldNs}:${oldNs === 'saturn' ? 'inspector-sa' : '\\w+'}`), (m) => m.replace(`${oldNs}:`, `${newNs}:`)],
      [new RegExp(`\\.${oldNs}:`, 'g'), `.${newNs}:`],
      [new RegExp(`${oldNs}\\.svc`, 'g'), `${newNs}.svc`],
    ];
    for (const [re, repl] of patterns) {
      out = typeof repl === 'function' ? out.replace(re, repl) : out.replace(re, repl);
    }
  }
  return out;
}

for (const file of FILES) {
  const filePath = path.join(EXAM_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const updated = replaceNamespaces(raw);
  if (updated !== raw) {
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`No changes in ${file}`);
  }
}
