const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const EXAMS_DIR = path.join(__dirname, 'exams');
const SANDBOX_DIR = path.join(__dirname, 'sandbox');
const SHELL = '/bin/bash';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Sandbox reset helpers ───────────────────────────────────────────────────

const SESSION_FILE = path.join(SANDBOX_DIR, '.exam-session.json');
const K8S_SESSION_DIR = path.join(SANDBOX_DIR, 'etc', 'kubernetes', 'session');
const MOCK_K8S_DIR = path.join(SANDBOX_DIR, 'etc', 'kubernetes', 'mock');
const COURSE_DIR = path.join(SANDBOX_DIR, 'opt', 'course');
const P1_TEMPLATE = 'project-23-api.yaml';

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

function resolveExamPathsForId(examId) {
  const legacyExam = path.join(EXAMS_DIR, `exam${examId}.md`);
  if (fs.existsSync(legacyExam)) {
    return { examPath: legacyExam, answerPath: path.join(EXAMS_DIR, `answer${examId}.md`), group: 'mock' };
  }
  const topicExam = path.join(EXAMS_DIR, examId, 'exam.md');
  if (fs.existsSync(topicExam)) {
    return { examPath: topicExam, answerPath: path.join(EXAMS_DIR, examId, 'answer.md'), group: 'practice' };
  }
  return null;
}

function extractNamespacesFromExam(content) {
  const namespaces = new Set();
  const patterns = [
    /Namespace [`']([^'`]+)[`']/gi,
    /namespace [`']([^'`]+)[`']/gi,
    /in Namespace [`']([^'`]+)[`']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) namespaces.add(m[1]);
  }
  return [...namespaces];
}

function configureExamSession(examId) {
  if (!examId) {
    fs.writeFileSync(path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'), '', 'utf-8');
    return;
  }

  const paths = resolveExamPathsForId(String(examId));
  if (!paths) {
    fs.writeFileSync(path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'), '', 'utf-8');
    return;
  }

  const content = fs.readFileSync(paths.examPath, 'utf-8');
  const session = {
    examId: String(examId),
    group: paths.group,
    startedAt: new Date().toISOString(),
  };

  let mockNamespaces = [];
  if (paths.group === 'mock') {
    mockNamespaces = extractNamespacesFromExam(content).sort();
  }

  session.mockNamespaces = mockNamespaces;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(K8S_SESSION_DIR, 'mock-namespaces.txt'),
    mockNamespaces.join('\n') + (mockNamespaces.length ? '\n' : ''),
    'utf-8'
  );
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

  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    if (/^\.bash_history(_q\d+)?$/.test(f)) unlinkIfExists(path.join(SANDBOX_DIR, f));
  }

  unlinkIfExists(path.join(SANDBOX_DIR, '.viminfo'));
  resetSandboxRootWorkFiles();
  resetCourseWorkFiles();
  clearTerminalInputBuffers();
  configureExamSession(examId);
}

// ─── API: Reset sandbox for new exam session ────────────────────────────────

app.post('/api/sandbox/reset', (req, res) => {
  try {
    resetSandboxState(req.body?.examId ?? null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Terminal command capture (PTY bash history is unreliable on macOS) ───────

const terminalInputBuffers = new Map();
const SKIP_HISTORY_COMMANDS = new Set(['', 'clear', 'history', 'history -a']);

function historyFileForQuestion(qId) {
  return path.join(SANDBOX_DIR, `.bash_history_q${qId}`);
}

function appendCommandLine(qId, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || SKIP_HISTORY_COMMANDS.has(trimmed)) return;
  fs.appendFileSync(historyFileForQuestion(String(qId)), `${trimmed}\n`, 'utf-8');
}

function recordTerminalInput(qId, data) {
  let buf = terminalInputBuffers.get(qId) ?? '';
  let i = 0;

  while (i < data.length) {
    const ch = data[i];

    if (ch === '\x1b') {
      i++;
      if (data[i] === '[') {
        i++;
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) i++;
      } else if (data[i] === 'O') {
        i++;
      }
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      appendCommandLine(qId, buf);
      buf = '';
      i++;
      continue;
    }

    if (ch === '\u007f' || ch === '\b') {
      buf = buf.slice(0, -1);
      i++;
      continue;
    }

    if (ch === '\u0003' || ch === '\u0015') {
      buf = '';
      i++;
      continue;
    }

    if (ch.charCodeAt(0) >= 32 || ch === '\t') {
      buf += ch;
    }
    i++;
  }

  terminalInputBuffers.set(qId, buf);
}

function clearTerminalInputBuffers() {
  terminalInputBuffers.clear();
}

// ─── API: Collect exam evidence for auto-scoring ─────────────────────────────

app.get('/api/session/evidence', (_req, res) => {
  try {
    const evidence = {
      commands: {},  // questionIndex (string) → string[]
      applied: {},   // filename → content
      files: {},     // relative path → content
    };

    // Per-question bash history
    for (const f of fs.readdirSync(SANDBOX_DIR)) {
      const m = f.match(/^\.bash_history_q(\d+)$/);
      if (!m) continue;
      const raw = fs.readFileSync(path.join(SANDBOX_DIR, f), 'utf-8');
      evidence.commands[m[1]] = raw.split('\n').filter(Boolean);
    }

    // Applied YAML files
    const appliedDir = path.join(SANDBOX_DIR, 'etc', 'kubernetes', 'applied');
    if (fs.existsSync(appliedDir)) {
      for (const f of fs.readdirSync(appliedDir)) {
        try {
          evidence.applied[f] = fs.readFileSync(path.join(appliedDir, f), 'utf-8');
        } catch { /* skip binary */ }
      }
    }

    // opt/course user files (recursive, skip large/binary)
    const courseDir = path.join(SANDBOX_DIR, 'opt', 'course');
    if (fs.existsSync(courseDir)) {
      const walk = (dir, base) => {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          const rel = path.join(base, f);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) { walk(full, rel); continue; }
          if (stat.size > 200_000) continue;
          try { evidence.files[rel] = fs.readFileSync(full, 'utf-8'); } catch { /* binary */ }
        }
      };
      walk(courseDir, 'opt/course');
    }

    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Exam discovery ──────────────────────────────────────────────────────────

const TOPIC_EXAM_ORDER = [
  'core_concepts',
  'multi_container_pods',
  'pod_design',
  'configuration',
  'observability',
  'services',
  'state',
  'helm',
  'crd',
  'podman',
];

function resolveExamPaths(id) {
  const legacyExam = path.join(EXAMS_DIR, `exam${id}.md`);
  const legacyAnswer = path.join(EXAMS_DIR, `answer${id}.md`);
  if (fs.existsSync(legacyExam)) {
    return { examPath: legacyExam, answerPath: legacyAnswer };
  }

  const topicExam = path.join(EXAMS_DIR, id, 'exam.md');
  const topicAnswer = path.join(EXAMS_DIR, id, 'answer.md');
  if (fs.existsSync(topicExam)) {
    return { examPath: topicExam, answerPath: topicAnswer };
  }

  return null;
}

function discoverExams() {
  const exams = [];
  const seen = new Set();

  for (const file of fs.readdirSync(EXAMS_DIR)) {
    const match = file.match(/^exam(\d+)\.md$/);
    if (!match) continue;

    const id = match[1];
    const paths = resolveExamPaths(id);
    if (!paths) continue;

    const content = fs.readFileSync(paths.examPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    exams.push({
      id,
      title: frontmatter.title || `Exam ${id}`,
      duration: parseInt(frontmatter.duration) || 120,
      passPercentage: parseInt(frontmatter.pass_percentage) || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'mock',
    });
    seen.add(id);
  }

  for (const slug of TOPIC_EXAM_ORDER) {
    const paths = resolveExamPaths(slug);
    if (!paths || seen.has(slug)) continue;

    const content = fs.readFileSync(paths.examPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    exams.push({
      id: slug,
      title: frontmatter.title || slug,
      duration: parseInt(frontmatter.duration) || 120,
      passPercentage: parseInt(frontmatter.pass_percentage) || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'practice',
    });
    seen.add(slug);
  }

  for (const entry of fs.readdirSync(EXAMS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || seen.has(entry.name)) continue;

    const paths = resolveExamPaths(entry.name);
    if (!paths) continue;

    const content = fs.readFileSync(paths.examPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    exams.push({
      id: entry.name,
      title: frontmatter.title || entry.name,
      duration: parseInt(frontmatter.duration) || 120,
      passPercentage: parseInt(frontmatter.pass_percentage) || 66,
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

// ─── API: List available exams ───────────────────────────────────────────────

app.get('/api/exams', (_req, res) => {
  try {
    const exams = discoverExams().sort((a, b) => examSortKey(a).localeCompare(examSortKey(b)));
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Get exam questions ─────────────────────────────────────────────────

app.get('/api/exams/:id', (req, res) => {
  try {
    const paths = resolveExamPaths(req.params.id);
    if (!paths) return res.status(404).json({ error: 'Exam not found' });

    const content = fs.readFileSync(paths.examPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const questions = parseQuestions(content);
    const sessionPaths = resolveExamPathsForId(req.params.id);

    res.json({
      id: req.params.id,
      title: frontmatter.title || `Exam ${req.params.id}`,
      duration: parseInt(frontmatter.duration) || 120,
      passPercentage: parseInt(frontmatter.pass_percentage) || 66,
      group: sessionPaths?.group || 'mock',
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Get answers ────────────────────────────────────────────────────────

app.get('/api/exams/:id/answers', (req, res) => {
  try {
    const paths = resolveExamPaths(req.params.id);
    if (!paths || !fs.existsSync(paths.answerPath)) {
      return res.status(404).json({ error: 'Answers not found' });
    }

    const content = fs.readFileSync(paths.answerPath, 'utf-8');
    const answers = parseAnswers(content);
    res.json(answers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Markdown Parsing ────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    meta[key] = val;
  }
  return meta;
}

function parseQuestions(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Question \d+)/);
  const questions = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Question (\d+)\s*\|\s*(.+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1]);
    const title = headerMatch[2].trim();
    const lines = trimmed.split('\n').slice(1);

    let weight = 0;
    let context = '';
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('weight:')) {
        weight = parseInt(line.replace('weight:', '').trim());
        bodyStart = i + 1;
      } else if (line.startsWith('context:')) {
        context = line.replace('context:', '').trim().replace(/`/g, '');
        bodyStart = i + 1;
      } else if (line !== '') {
        bodyStart = i;
        break;
      }
    }

    const questionBody = lines.slice(bodyStart).join('\n').trim();

    questions.push({ number, title, weight, context, body: questionBody });
  }

  return questions;
}

function parseAnswers(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Answer \d+)/);
  const answers = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Answer (\d+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1]);
    const answerBody = trimmed.split('\n').slice(1).join('\n').trim();

    const criteria = [];
    const criteriaPattern = /- \[ \] (.+)/g;
    let m;
    while ((m = criteriaPattern.exec(answerBody)) !== null) {
      criteria.push(m[1]);
    }

    answers.push({ number, body: answerBody, criteria });
  }

  return answers;
}

// ─── WebSocket: Terminal Multiplexing ────────────────────────────────────────

let wsCounter = 0;

wss.on('connection', (ws) => {
  const clientId = ++wsCounter;
  const terminals = new Map();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const qId = msg.questionId;

    switch (msg.type) {
      case 'create': {
        if (terminals.has(qId)) {
          ws.send(JSON.stringify({ type: 'created', questionId: qId }));
          return;
        }

        terminalInputBuffers.delete(String(qId));

        const cols = Math.max(msg.cols || 80, 2);
        const rows = Math.max(msg.rows || 30, 2);

        let shell;
        try {
          const sandboxBin = path.join(SANDBOX_DIR, 'bin');
          const systemPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';

          shell = pty.spawn(SHELL, ['--init-file', path.join(SANDBOX_DIR, '.bashrc')], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: SANDBOX_DIR,
            env: {
              TERM: 'xterm-256color',
              HOME: SANDBOX_DIR,
              SANDBOX_ROOT: SANDBOX_DIR,
              PATH: `${sandboxBin}:${systemPath}`,
              USER: 'student',
              SHELL: '/bin/bash',
              LANG: process.env.LANG || 'en_US.UTF-8',
              CKAD_QUESTION: String(qId),
              EDITOR: 'vim',
              KUBE_EDITOR: 'vim',
              KUBECONFIG: '/dev/null',
              REAL_HOME: process.env.HOME || '',
              BASH_SILENCE_DEPRECATION_WARNING: '1',
            },
          });
        } catch (err) {
          console.error(`PTY spawn failed for Q${qId}:`, err.message);
          ws.send(JSON.stringify({ type: 'error', questionId: qId, message: err.message }));
          return;
        }

        shell.on('data', (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', questionId: qId, data }));
          }
        });

        shell.on('exit', () => {
          terminals.delete(qId);
        });

        terminals.set(qId, shell);
        ws.send(JSON.stringify({ type: 'created', questionId: qId }));
        break;
      }

      case 'input': {
        const term = terminals.get(qId);
        if (term) {
          recordTerminalInput(String(qId), msg.data);
          term.write(msg.data);
        }
        break;
      }

      case 'resize': {
        const term = terminals.get(qId);
        if (term) {
          try {
            term.resize(msg.cols, msg.rows);
          } catch { /* ignore resize errors */ }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    for (const [, shell] of terminals) {
      try { shell.kill(); } catch { /* ignore */ }
    }
    terminals.clear();
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n  CKAD Simulator running at http://localhost:${PORT}\n`);
});
