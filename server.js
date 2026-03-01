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

// ─── API: Reset sandbox for new exam session ────────────────────────────────

app.post('/api/sandbox/reset', (_req, res) => {
  try {
    const k8sDir = path.join(SANDBOX_DIR, 'etc', 'kubernetes');
    const nsFile = path.join(k8sDir, 'namespace');
    const ctxFile = path.join(k8sDir, 'context');
    const appliedDir = path.join(k8sDir, 'applied');

    fs.writeFileSync(nsFile, 'default', 'utf-8');
    fs.writeFileSync(ctxFile, 'kubernetes-admin@kubernetes', 'utf-8');

    if (fs.existsSync(appliedDir)) {
      for (const f of fs.readdirSync(appliedDir)) {
        fs.unlinkSync(path.join(appliedDir, f));
      }
    }
    fs.mkdirSync(appliedDir, { recursive: true });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: List available exams ───────────────────────────────────────────────

app.get('/api/exams', (_req, res) => {
  try {
    const files = fs.readdirSync(EXAMS_DIR);
    const exams = [];
    const examPattern = /^exam(\d+)\.md$/;

    for (const file of files) {
      const match = file.match(examPattern);
      if (!match) continue;

      const id = match[1];
      const hasAnswer = files.includes(`answer${id}.md`);
      const content = fs.readFileSync(path.join(EXAMS_DIR, file), 'utf-8');
      const frontmatter = parseFrontmatter(content);

      exams.push({
        id,
        title: frontmatter.title || `Exam ${id}`,
        duration: parseInt(frontmatter.duration) || 120,
        passPercentage: parseInt(frontmatter.pass_percentage) || 66,
        hasAnswer,
      });
    }

    exams.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Get exam questions ─────────────────────────────────────────────────

app.get('/api/exams/:id', (req, res) => {
  try {
    const filePath = path.join(EXAMS_DIR, `exam${req.params.id}.md`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Exam not found' });

    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const questions = parseQuestions(content);

    res.json({
      id: req.params.id,
      title: frontmatter.title || `Exam ${req.params.id}`,
      duration: parseInt(frontmatter.duration) || 120,
      passPercentage: parseInt(frontmatter.pass_percentage) || 66,
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Get answers ────────────────────────────────────────────────────────

app.get('/api/exams/:id/answers', (req, res) => {
  try {
    const filePath = path.join(EXAMS_DIR, `answer${req.params.id}.md`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Answers not found' });

    const content = fs.readFileSync(filePath, 'utf-8');
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
        if (term) term.write(msg.data);
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
