const fs = require('fs');
const path = require('path');
const { EXAMS_DIR, EXAMS_DIR_RESOLVED, TOPIC_EXAM_ORDER } = require('../config');
const { examFromMarkdown, answersFromMarkdown } = require('./md-parser');

function isSafeExamId(id) {
  if (typeof id !== 'string' || !id) return false;
  if (/^\d+$/.test(id)) return true;
  return /^[a-z0-9_-]+$/.test(id);
}

function isPathWithinExamsDir(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === EXAMS_DIR_RESOLVED || resolved.startsWith(`${EXAMS_DIR_RESOLVED}${path.sep}`);
}

function resolveExamPaths(id) {
  if (!isSafeExamId(String(id))) return null;

  const legacyJson = path.join(EXAMS_DIR, `exam${id}.json`);
  const legacyExam = path.join(EXAMS_DIR, `exam${id}.md`);
  const legacyAnswerJson = path.join(EXAMS_DIR, `answer${id}.json`);
  const legacyAnswer = path.join(EXAMS_DIR, `answer${id}.md`);

  if (fs.existsSync(legacyJson) && isPathWithinExamsDir(legacyJson)) {
    return {
      examPath: legacyJson,
      answerPath: fs.existsSync(legacyAnswerJson) ? legacyAnswerJson : legacyAnswer,
      format: 'json',
      group: 'mock',
    };
  }
  if (fs.existsSync(legacyExam) && isPathWithinExamsDir(legacyExam)) {
    return { examPath: legacyExam, answerPath: legacyAnswer, format: 'md', group: 'mock' };
  }

  const topicJson = path.join(EXAMS_DIR, id, 'exam.json');
  const topicExam = path.join(EXAMS_DIR, id, 'exam.md');
  const topicAnswerJson = path.join(EXAMS_DIR, id, 'answer.json');
  const topicAnswer = path.join(EXAMS_DIR, id, 'answer.md');

  if (fs.existsSync(topicJson) && isPathWithinExamsDir(topicJson)) {
    return {
      examPath: topicJson,
      answerPath: fs.existsSync(topicAnswerJson) ? topicAnswerJson : topicAnswer,
      format: 'json',
      group: 'practice',
    };
  }
  if (fs.existsSync(topicExam) && isPathWithinExamsDir(topicExam)) {
    return { examPath: topicExam, answerPath: topicAnswer, format: 'md', group: 'practice' };
  }

  return null;
}

function loadExamFile(paths) {
  if (paths.format === 'json') {
    return JSON.parse(fs.readFileSync(paths.examPath, 'utf-8'));
  }
  return examFromMarkdown(fs.readFileSync(paths.examPath, 'utf-8'));
}

function loadAnswerFile(paths) {
  if (!fs.existsSync(paths.answerPath)) return null;
  if (paths.answerPath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(paths.answerPath, 'utf-8'));
  }
  return answersFromMarkdown(fs.readFileSync(paths.answerPath, 'utf-8'));
}

function discoverExams() {
  const exams = [];
  const seen = new Set();

  for (const file of fs.readdirSync(EXAMS_DIR)) {
    const match = file.match(/^exam(\d+)\.(json|md)$/);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;

    const paths = resolveExamPaths(id);
    if (!paths) continue;

    const exam = loadExamFile(paths);
    exams.push({
      id,
      title: exam.title || `Exam ${id}`,
      duration: exam.duration || 120,
      passPercentage: exam.passPercentage || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'mock',
    });
    seen.add(id);
  }

  for (const slug of TOPIC_EXAM_ORDER) {
    if (seen.has(slug)) continue;
    const paths = resolveExamPaths(slug);
    if (!paths) continue;

    const exam = loadExamFile(paths);
    exams.push({
      id: slug,
      title: exam.title || slug,
      duration: exam.duration || 120,
      passPercentage: exam.passPercentage || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'practice',
    });
    seen.add(slug);
  }

  for (const entry of fs.readdirSync(EXAMS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || seen.has(entry.name)) continue;
    const paths = resolveExamPaths(entry.name);
    if (!paths) continue;

    const exam = loadExamFile(paths);
    exams.push({
      id: entry.name,
      title: exam.title || entry.name,
      duration: exam.duration || 120,
      passPercentage: exam.passPercentage || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'practice',
    });
  }

  return exams;
}

function examSortKey(exam) {
  if (exam.group === 'mock') return `0-${String(exam.id).padStart(4, '0')}`;
  const idx = TOPIC_EXAM_ORDER.indexOf(exam.id);
  return `1-${String(idx === -1 ? 999 : idx).padStart(4, '0')}-${exam.id}`;
}

function getExamPayload(id) {
  const paths = resolveExamPaths(id);
  if (!paths) return null;

  const exam = loadExamFile(paths);
  return {
    id,
    title: exam.title || `Exam ${id}`,
    duration: exam.duration || 120,
    passPercentage: exam.passPercentage || 66,
    group: paths.group,
    questions: exam.questions || [],
  };
}

function getAnswersPayload(id) {
  const paths = resolveExamPaths(id);
  if (!paths || !fs.existsSync(paths.answerPath)) return null;

  const data = loadAnswerFile(paths);
  return data.answers || data;
}

module.exports = {
  isSafeExamId,
  resolveExamPaths,
  discoverExams,
  examSortKey,
  getExamPayload,
  getAnswersPayload,
  loadExamFile,
};
