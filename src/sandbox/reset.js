const fs = require('fs');
const path = require('path');
const { SANDBOX_DIR } = require('../config');
const { resolveExamPaths, loadExamFile } = require('../exam/registry');
const { extractNamespacesFromText } = require('../exam/md-parser');

const SESSION_FILE = path.join(SANDBOX_DIR, '.exam-session.json');
const K8S_SESSION_DIR = path.join(SANDBOX_DIR, 'etc', 'kubernetes', 'session');
const COURSE_DIR = path.join(SANDBOX_DIR, 'opt', 'course');
const P1_TEMPLATE = 'project-23-api.yaml';

const terminalInputBuffers = new Map();

function unlinkIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function resetSandboxRootWorkFiles() {
  const workExts = new Set(['.yaml', '.yml', '.sh', '.json', '.txt', '.conf', '.md']);
  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    const full = path.join(SANDBOX_DIR, f);
    if (!fs.statSync(full).isFile()) continue;
    if (workExts.has(path.extname(f))) fs.unlinkSync(full);
  }
}

function resetCourseWorkFiles() {
  if (!fs.existsSync(COURSE_DIR)) return;

  for (const dirName of fs.readdirSync(COURSE_DIR)) {
    const dirPath = path.join(COURSE_DIR, dirName);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    for (const fileName of fs.readdirSync(dirPath)) {
      if (dirName === 'p1' && fileName === P1_TEMPLATE) continue;
      if (fileName === 'README.txt') continue;
      unlinkIfExists(path.join(dirPath, fileName));
    }
  }
}

function resetSessionDir() {
  if (fs.existsSync(K8S_SESSION_DIR)) {
    fs.rmSync(K8S_SESSION_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(K8S_SESSION_DIR, { recursive: true });
}

function extractNamespacesFromExam(exam) {
  const namespaces = new Set();
  for (const q of exam.questions || []) {
    for (const ns of extractNamespacesFromText(q.body || '')) namespaces.add(ns);
  }
  return [...namespaces];
}

function configureExamSession(examId) {
  if (!examId) {
    fs.writeFileSync(path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'), '', 'utf-8');
    return;
  }

  const paths = resolveExamPaths(String(examId));
  if (!paths) {
    fs.writeFileSync(path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'), '', 'utf-8');
    return;
  }

  const exam = loadExamFile(paths);
  const session = {
    examId: String(examId),
    group: paths.group,
    startedAt: new Date().toISOString(),
  };

  let mockNamespaces = [];
  if (paths.group === 'mock') {
    mockNamespaces = extractNamespacesFromExam(exam).sort();
  }

  session.mockNamespaces = mockNamespaces;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'),
    mockNamespaces.join('\n') + (mockNamespaces.length ? '\n' : ''),
    'utf-8'
  );
}

function clearTerminalInputBuffers() {
  terminalInputBuffers.clear();
}

function resetSandboxState(examId = null) {
  const k8sDir = path.join(SANDBOX_DIR, 'etc', 'kubernetes');
  fs.writeFileSync(path.join(k8sDir, 'namespace'), 'default', 'utf-8');
  fs.writeFileSync(path.join(k8sDir, 'context'), 'kubernetes-admin@kubernetes', 'utf-8');

  const appliedDir = path.join(k8sDir, 'applied');
  if (fs.existsSync(appliedDir)) {
    for (const f of fs.readdirSync(appliedDir)) unlinkIfExists(path.join(appliedDir, f));
  }
  fs.mkdirSync(appliedDir, { recursive: true });

  resetSessionDir();

  const helmReleasesDir = path.join(SANDBOX_DIR, 'etc', 'helm', 'releases');
  if (fs.existsSync(helmReleasesDir)) {
    fs.rmSync(helmReleasesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(helmReleasesDir, { recursive: true });

  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    if (/^\.bash_history(_q\d+)?$/.test(f)) unlinkIfExists(path.join(SANDBOX_DIR, f));
  }

  unlinkIfExists(path.join(SANDBOX_DIR, '.viminfo'));
  resetSandboxRootWorkFiles();
  resetCourseWorkFiles();
  clearTerminalInputBuffers();
  configureExamSession(examId);
}

module.exports = {
  terminalInputBuffers,
  resetSandboxState,
  clearTerminalInputBuffers,
  SANDBOX_DIR,
};
