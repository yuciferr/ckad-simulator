#!/usr/bin/env node
/**
 * Converts dgkanatsios/CKAD-exercises markdown files into ckad-simulator exam format.
 * Usage: node scripts/convert-ckad-exercises.js [source-dir]
 */

const fs = require('fs');
const path = require('path');
const { normalizeAnswerContent } = require('./normalize-answer-format');

const SOURCE_DIR = process.argv[2] || path.join(__dirname, '../../CKAD-exercises');
const EXAMS_DIR = path.join(__dirname, '../exams');

const TOPICS = [
  { file: 'a.core_concepts.md', slug: 'core_concepts', title: 'Core Concepts', curriculum: '13%' },
  { file: 'b.multi_container_pods.md', slug: 'multi_container_pods', title: 'Multi-Container Pods', curriculum: '10%' },
  { file: 'c.pod_design.md', slug: 'pod_design', title: 'Pod Design', curriculum: '20%' },
  { file: 'd.configuration.md', slug: 'configuration', title: 'Configuration', curriculum: '18%' },
  { file: 'e.observability.md', slug: 'observability', title: 'Observability', curriculum: '18%' },
  { file: 'f.services.md', slug: 'services', title: 'Services & Networking', curriculum: '13%' },
  { file: 'g.state.md', slug: 'state', title: 'State Persistence', curriculum: '8%' },
  { file: 'h.helm.md', slug: 'helm', title: 'Helm', curriculum: null },
  { file: 'i.crd.md', slug: 'crd', title: 'Custom Resource Definitions', curriculum: null },
  { file: 'j.podman.md', slug: 'podman', title: 'Podman', curriculum: null },
];

function parseQuestions(content) {
  content = content.replace(/^!\[[^\]]*\]\([^)]+\)\s*\n/, '');

  const questions = [];
  const blocks = content.split(/\n(?=### )/);

  for (const block of blocks) {
    if (!block.trim().startsWith('### ')) continue;

    const detailsIdx = block.indexOf('<details>');
    if (detailsIdx === -1) continue;

    const headerLine = block.slice(0, detailsIdx).trim();
    const title = headerLine.replace(/^### /, '').trim();
    if (!title) continue;

    const detailsMatch = block.slice(detailsIdx).match(
      /<details><summary>show<\/summary>\s*<p>\s*([\s\S]*?)<\/p>\s*<\/details>/
    );
    if (!detailsMatch) continue;

    questions.push({
      title,
      answer: detailsMatch[1].trim(),
    });
  }

  return questions;
}

function extractReferences(content) {
  const refs = [];
  for (const line of content.split('\n')) {
    if (line.startsWith('kubernetes.io >') || line.startsWith('- kubernetes.io')) {
      refs.push(line.trim());
    }
  }
  return refs;
}

function shortTitle(fullTitle, maxLen = 60) {
  if (fullTitle.length <= maxLen) return fullTitle;
  const cut = fullTitle.slice(0, maxLen - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + '...';
}

function buildExamMd(topic, questions, references) {
  const duration = Math.max(30, Math.ceil(questions.length * 5));
  const weightEach = Math.max(1, Math.floor(100 / questions.length));
  const curriculumNote = topic.curriculum ? ` (${topic.curriculum} of exam)` : '';

  let md = `---
title: CKAD Practice - ${topic.title}${curriculumNote}
duration: ${duration}
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

`;

  if (references.length > 0) {
    md += `# Documentation References\n\n`;
    for (const ref of references) {
      md += `- ${ref}\n`;
    }
    md += `\n`;
  }

  questions.forEach((q, i) => {
    const num = i + 1;
    md += `# Question ${num} | ${shortTitle(q.title)}\n`;
    md += `weight: ${weightEach}\n\n`;
    md += `${q.title}\n\n`;
  });

  return md;
}

function buildAnswerMd(topic, questions) {
  let md = `---
title: CKAD Practice - ${topic.title} (Answers)
source: https://github.com/dgkanatsios/CKAD-exercises
---

`;

  questions.forEach((q, i) => {
    const num = i + 1;
    md += `# Answer ${num}\n\n`;
    md += `**Question:** ${q.title}\n\n`;
    md += `**Solution:**\n\n${normalizeAnswerContent(q.answer)}\n\n---\n\n`;
  });

  return md;
}

function convertTopic(topic) {
  const srcPath = path.join(SOURCE_DIR, topic.file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`Skip ${topic.slug}: ${srcPath} not found`);
    return null;
  }

  const content = fs.readFileSync(srcPath, 'utf-8');
  const questions = parseQuestions(content);
  const references = extractReferences(content);

  if (questions.length === 0) {
    console.warn(`Skip ${topic.slug}: no questions parsed`);
    return null;
  }

  const outDir = path.join(EXAMS_DIR, topic.slug);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'exam.md'), buildExamMd(topic, questions, references));
  fs.writeFileSync(path.join(outDir, 'answer.md'), buildAnswerMd(topic, questions));

  return { slug: topic.slug, count: questions.length };
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const results = [];
  for (const topic of TOPICS) {
    const result = convertTopic(topic);
    if (result) {
      results.push(result);
      console.log(`✓ ${result.slug}: ${result.count} questions`);
    }
  }

  console.log(`\nConverted ${results.length} topics, ${results.reduce((s, r) => s + r.count, 0)} total questions`);
}

main();
