/* ═══════════════════════════════════════════════════════════════════════════
   CKAD Simulator — Client Application
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  currentScreen: 'landing',
  exam: null,
  answers: null,
  currentQuestion: 0,
  flagged: new Set(),
  timerSeconds: 0,
  timerInterval: null,
  ws: null,
  terminals: new Map(),
  terminalWrappers: new Map(),
  reviewScores: {},
  evidence: null,       // raw evidence from /api/session/evidence
  autoScored: {},       // { [qNum]: { [criteriaIdx]: { auto, confidence, reason } } }
};

// ─── DOM References ──────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Initialization ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadExamList();
  bindEvents();
  window.addEventListener('resize', () => fitActiveTerminal());
}

// ─── Event Binding ───────────────────────────────────────────────────────────

function bindEvents() {
  $('#btnPrev').addEventListener('click', () => navigateQuestion(-1));
  $('#btnNext').addEventListener('click', () => navigateQuestion(1));
  $('#btnSatisfied').addEventListener('click', () => navigateQuestion(1));
  $('#btnEndExam').addEventListener('click', showEndExamModal);
  $('#btnFlag').addEventListener('click', toggleFlag);
  $('#btnQuestionList').addEventListener('click', toggleDropdown.bind(null, 'questionDropdown'));
  $('#btnReviewQuestionList').addEventListener('click', toggleDropdown.bind(null, 'reviewQuestionDropdown'));
  $('#btnReviewPrev').addEventListener('click', () => navigateReviewQuestion(-1));
  $('#btnReviewNext').addEventListener('click', () => navigateReviewQuestion(1));
  $('#btnBackToHome').addEventListener('click', backToHome);
  $('#modalCancel').addEventListener('click', hideModal);
  $('#modalConfirm').addEventListener('click', endExam);
  initResizer();
  initPanelTabs();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.question-dropdown')) {
      $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
    }
  });
}

function initPanelTabs() {
  $$('.panel-left .panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.panel-left .panel-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $$('.panel-left .tab-content').forEach((tc) => {
        tc.classList.toggle('active', tc.id === `tab${capitalize(target)}`);
      });
    });
  });
}

function initResizer() {
  const resizer = $('#resizer');
  const panelLeft = $('#panelLeft');
  let startX, startWidth;

  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = panelLeft.offsetWidth;
    resizer.classList.add('active');
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  });

  function onResize(e) {
    const newWidth = startWidth + (e.clientX - startX);
    const min = 250;
    const max = window.innerWidth - 400;
    panelLeft.style.width = Math.max(min, Math.min(max, newWidth)) + 'px';
    fitActiveTerminal();
  }

  function stopResize() {
    resizer.classList.remove('active');
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    fitActiveTerminal();
  }
}

// ─── Screen Management ───────────────────────────────────────────────────────

function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${name}`).classList.add('active');
  state.currentScreen = name;
  document.body.classList.toggle('landing-open', name === 'landing');
}

function renderExamCard(e) {
  const group = e.group || 'mock';
  const badge = group === 'mock' ? 'Mock Exam' : 'Practice';
  return `
    <button class="exam-card ${group}" data-exam-id="${e.id}" aria-label="Start ${e.title}">
      <div>
        <div class="exam-card-badge">${badge}</div>
        <div class="exam-card-title">${e.title}</div>
      </div>
      <div class="exam-card-meta">
        <span>⏱ ${e.duration} min</span>
        <span>📋 Pass ${e.passPercentage}%</span>
        <span>${e.hasAnswer ? '✅ Answers' : '⚠️ No answers'}</span>
      </div>
    </button>
  `;
}

function renderExamSection(title, description, exams) {
  if (exams.length === 0) return '';
  return `
    <section class="exam-section">
      <div class="exam-section-header">
        <div class="exam-section-title">${title}</div>
        <div class="exam-section-desc">${description}</div>
      </div>
      <div class="exam-grid">
        ${exams.map(renderExamCard).join('')}
      </div>
    </section>
  `;
}

async function loadExamList() {
  try {
    const res = await fetch('/api/exams');
    const exams = await res.json();

    const container = $('#landingContent');
    if (exams.length === 0) {
      container.innerHTML = '<div class="loading">No exams found. Add exam files to the /exams directory.</div>';
      return;
    }

    const mockExams = exams.filter((e) => e.group === 'mock');
    const practiceExams = exams.filter((e) => e.group !== 'mock');

    container.innerHTML =
      renderExamSection(
        'Mock Exams',
        'Full timed simulations with pre-seeded cluster resources',
        mockExams
      ) +
      renderExamSection(
        'Practice Modules',
        'Topic drills — clean cluster, create your own resources',
        practiceExams
      );

    container.querySelectorAll('.exam-card').forEach((card) => {
      card.addEventListener('click', () => startExam(card.dataset.examId));
    });
  } catch (err) {
    $('#landingContent').innerHTML = `<div class="loading">Error loading exams: ${err.message}</div>`;
  }
}

// ─── Start Exam ──────────────────────────────────────────────────────────────

async function startExam(examId) {
  try {
    await fetch('/api/sandbox/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId }),
    });

    const res = await fetch(`/api/exams/${examId}`);
    state.exam = await res.json();
    state.currentQuestion = 0;
    state.flagged = new Set();
    state.timerSeconds = state.exam.duration * 60;
    state.reviewScores = {};

    try {
      const ansRes = await fetch(`/api/exams/${examId}/answers`);
      if (ansRes.ok) state.answers = await ansRes.json();
    } catch {
      state.answers = null;
    }

    $('#examTitle').textContent = state.exam.title;
    $('#totalQNum').textContent = state.exam.questions.length;
    $('#reviewTotalQNum').textContent = state.exam.questions.length;

    connectWebSocket();
    buildQuestionDropdown();
    showScreen('exam');
    renderQuestion();
    startTimer();
  } catch (err) {
    alert('Failed to load exam: ' + err.message);
  }
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer() {
  clearInterval(state.timerInterval);
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      endExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const s = Math.max(0, state.timerSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const display = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  const el = $('#timer');
  el.textContent = display;
  el.classList.remove('warning', 'critical');
  if (s <= 300) el.classList.add('critical');
  else if (s <= 900) el.classList.add('warning');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// ─── WebSocket & Terminals ───────────────────────────────────────────────────

function connectWebSocket() {
  if (state.ws) {
    state.ws.close();
    destroyAllTerminals();
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.addEventListener('open', () => {
    ensureTerminal(state.currentQuestion);
  });

  state.ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'output') {
      const entry = state.terminals.get(msg.questionId);
      if (entry) entry.terminal.write(msg.data);
    } else if (msg.type === 'error') {
      console.error(`Terminal error Q${msg.questionId}:`, msg.message);
      const entry = state.terminals.get(msg.questionId);
      if (entry) entry.terminal.write(`\r\n\x1b[31mTerminal error: ${msg.message}\x1b[0m\r\n`);
    }
  });

  state.ws.addEventListener('close', () => {
    setTimeout(() => {
      if (state.currentScreen === 'exam') connectWebSocket();
    }, 2000);
  });

  state.ws.addEventListener('error', () => {
    console.error('WebSocket connection error');
  });
}

function ensureTerminal(questionId) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  if (state.terminals.has(questionId)) {
    showTerminal(questionId);
    return;
  }

  const container = $('#terminalContainer');
  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.id = `term-${questionId}`;
  container.appendChild(wrapper);

  state.terminalWrappers.forEach((w) => w.classList.remove('active'));
  wrapper.classList.add('active');
  state.terminalWrappers.set(questionId, wrapper);

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Menlo', 'Courier New', monospace",
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#264f78',
    },
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(wrapper);

  setTimeout(() => {
    fitAddon.fit();
    const cols = terminal.cols || 80;
    const rows = terminal.rows || 24;
    wsSend({ type: 'create', questionId, cols, rows });
    terminal.focus();
  }, 50);

  terminal.onData((data) => {
    wsSend({ type: 'input', questionId, data });
  });

  terminal.onResize(({ cols, rows }) => {
    wsSend({ type: 'resize', questionId, cols, rows });
  });

  state.terminals.set(questionId, { terminal, fitAddon });

  wrapper.addEventListener('click', () => terminal.focus());
}

function showTerminal(questionId) {
  state.terminalWrappers.forEach((w) => w.classList.remove('active'));
  const wrapper = state.terminalWrappers.get(questionId);
  if (wrapper) {
    wrapper.classList.add('active');
    const entry = state.terminals.get(questionId);
    if (entry) {
      requestAnimationFrame(() => {
        entry.fitAddon.fit();
        entry.terminal.focus();
      });
    }
  }
}

function fitActiveTerminal() {
  const qId = state.currentQuestion;
  const entry = state.terminals.get(qId);
  if (entry) {
    try { entry.fitAddon.fit(); } catch { /* ignore */ }
  }
}

function destroyAllTerminals() {
  state.terminals.forEach(({ terminal }) => {
    try { terminal.dispose(); } catch { /* ignore */ }
  });
  state.terminals.clear();
  state.terminalWrappers.forEach((w) => w.remove());
  state.terminalWrappers.clear();
}

function wsSend(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(msg));
  }
}

// ─── Question Navigation ─────────────────────────────────────────────────────

function navigateQuestion(dir) {
  const total = state.exam.questions.length;
  const next = state.currentQuestion + dir;
  if (next < 0 || next >= total) return;
  state.currentQuestion = next;
  renderQuestion();
}

function goToQuestion(idx) {
  state.currentQuestion = idx;
  renderQuestion();
  $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
}

function renderQuestion() {
  const q = state.exam.questions[state.currentQuestion];
  if (!q) return;

  $('#currentQNum').textContent = q.number;
  $('#questionWeight').textContent = `Weight: ${q.weight}%`;

  const ctxEl = $('#questionContext');
  if (q.context) {
    ctxEl.textContent = q.context;
    ctxEl.classList.add('visible');
  } else {
    ctxEl.classList.remove('visible');
  }

  $('#questionBody').innerHTML = marked.parse(q.body);
  attachCopyHandlers($('#questionBody'));

  const flagBtn = $('#btnFlag');
  flagBtn.classList.toggle('flagged', state.flagged.has(state.currentQuestion));

  updateDropdownHighlight('questionDropdown');
  ensureTerminal(state.currentQuestion);
}

// ─── Flag ────────────────────────────────────────────────────────────────────

function toggleFlag() {
  const idx = state.currentQuestion;
  if (state.flagged.has(idx)) state.flagged.delete(idx);
  else state.flagged.add(idx);
  $('#btnFlag').classList.toggle('flagged', state.flagged.has(idx));
  buildQuestionDropdown();
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

function buildQuestionDropdown() {
  const html = state.exam.questions
    .map(
      (q, i) => `
    <div class="dropdown-item ${i === state.currentQuestion ? 'active' : ''}" data-idx="${i}">
      <span class="q-num">${q.number}</span>
      <span class="q-title">${q.title}</span>
      <span class="q-weight">${q.weight}%</span>
      ${state.flagged.has(i) ? '<span class="q-flag">⚑</span>' : ''}
    </div>
  `
    )
    .join('');

  $('#questionDropdown').innerHTML = html;
  $('#questionDropdown')
    .querySelectorAll('.dropdown-item')
    .forEach((item) => {
      item.addEventListener('click', () => goToQuestion(parseInt(item.dataset.idx)));
    });

  $('#reviewQuestionDropdown').innerHTML = html;
  $('#reviewQuestionDropdown')
    .querySelectorAll('.dropdown-item')
    .forEach((item) => {
      item.addEventListener('click', () => {
        state.currentQuestion = parseInt(item.dataset.idx);
        renderReviewQuestion();
        $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
      });
    });
}

function updateDropdownHighlight(dropdownId) {
  $(`#${dropdownId}`)
    .querySelectorAll('.dropdown-item')
    .forEach((item, i) => {
      item.classList.toggle('active', i === state.currentQuestion);
    });
}

function toggleDropdown(id) {
  const dd = $(`#${id}`);
  dd.classList.toggle('open');
}

// ─── End Exam ────────────────────────────────────────────────────────────────

function showEndExamModal() {
  const unanswered = state.flagged.size;
  $('#modalTitle').textContent = 'End Exam?';
  $('#modalBody').textContent = `Are you sure you want to end the exam?${unanswered > 0 ? ` You have ${unanswered} flagged question(s).` : ''} You will enter review mode.`;
  $('#modalOverlay').classList.add('open');
}

function hideModal() {
  $('#modalOverlay').classList.remove('open');
}

async function endExam() {
  hideModal();
  clearInterval(state.timerInterval);

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  destroyAllTerminals();

  if (!state.answers || state.answers.length === 0) {
    alert('No answers available for this exam. Returning to home.');
    backToHome();
    return;
  }

  // Give bash a moment to flush history files, then collect evidence
  await new Promise((r) => setTimeout(r, 400));
  try {
    const res = await fetch('/api/session/evidence');
    if (res.ok) {
      state.evidence = await res.json();
      autoScoreAll();
    }
  } catch { /* proceed without auto-scoring */ }

  state.currentQuestion = 0;
  showScreen('review');
  renderReviewQuestion();
}

// ─── Auto-Scoring Engine ─────────────────────────────────────────────────────

function autoScoreAll() {
  if (!state.evidence || !state.exam || !state.answers) return;

  for (const q of state.exam.questions) {
    const a = state.answers.find((ans) => ans.number === q.number);
    if (!a || a.criteria.length === 0) continue;

    const qIdx = state.exam.questions.indexOf(q); // 0-based index used as CKAD_QUESTION
    state.autoScored[q.number] = {};

    a.criteria.forEach((criterion, i) => {
      const result = scoreOneCriterion(criterion, qIdx, q.number, state.evidence);
      state.autoScored[q.number][i] = result;
      // Pre-populate reviewScores only if not already set by user
      if (result.auto && !(state.reviewScores[q.number] && state.reviewScores[q.number][i] !== undefined)) {
        if (!state.reviewScores[q.number]) state.reviewScores[q.number] = {};
        state.reviewScores[q.number][i] = true;
      }
    });
  }
}

function scoreOneCriterion(criterion, qIdx, qNumber, evidence) {
  const cLow = criterion.toLowerCase();

  // Build evidence text layers (most specific first)
  const qCmds = (evidence.commands[String(qIdx)] || []).join('\n').toLowerCase();
  const allCmds = Object.values(evidence.commands).flat().join('\n').toLowerCase();
  const appliedText = Object.values(evidence.applied || {}).join('\n').toLowerCase();

  // Files specific to this question's path (opt/course/pN/)
  const pPrefix = `opt/course/p${qNumber}/`;
  const qFileText = Object.entries(evidence.files || {})
    .filter(([k]) => k.startsWith(pPrefix))
    .map(([, v]) => v)
    .join('\n')
    .toLowerCase();

  const allFileText = Object.values(evidence.files || {}).join('\n').toLowerCase();

  // The main evidence blob for this question
  const mainEvidence = [qCmds, appliedText, qFileText].join('\n');
  const broadEvidence = [allCmds, appliedText, allFileText].join('\n');

  // ── Rule 1: File path mentioned in criterion → check file exists ──────────
  const pathsInCriterion = criterion.match(/\/opt\/[^\s,)']+|\/tmp\/[^\s,)']+/g) || [];
  for (const p of pathsInCriterion) {
    const rel = p.replace(/^\/opt\/course\//, 'opt/course/').replace(/^\/opt\//, 'opt/');
    if (evidence.files && evidence.files[rel]) {
      return { auto: true, confidence: 'high', reason: `File found: ${p}` };
    }
    // Partial name match
    const base = p.split('/').pop();
    if (evidence.files && Object.keys(evidence.files).some((k) => k.endsWith(base))) {
      return { auto: true, confidence: 'high', reason: `File found: ${base}` };
    }
  }

  // ── Rule 2: camelCase k8s fields + optional numeric values ───────────────
  const camelWords = criterion.match(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g) || [];
  const numbers = criterion.match(/\b\d+\b/g) || [];

  if (camelWords.length > 0) {
    const foundCamel = camelWords.filter((w) => broadEvidence.includes(w.toLowerCase()));
    const foundNums = numbers.filter((n) => {
      // Number must appear near the camelCase word in evidence (within 60 chars)
      for (const w of foundCamel) {
        const idx = broadEvidence.indexOf(w.toLowerCase());
        if (idx !== -1 && broadEvidence.slice(idx, idx + 60).includes(n)) return true;
      }
      return broadEvidence.includes(n);
    });

    if (foundCamel.length === camelWords.length) {
      if (numbers.length === 0 || foundNums.length === numbers.length) {
        return {
          auto: true, confidence: 'high',
          reason: `Found in files/history: ${foundCamel.join(', ')}${foundNums.length ? ` = ${foundNums.join(', ')}` : ''}`,
        };
      }
      return {
        auto: true, confidence: 'medium',
        reason: `Field found but values not confirmed: ${foundCamel.join(', ')}`,
      };
    }
    if (foundCamel.length > 0) {
      return { auto: true, confidence: 'low', reason: `Partial field match: ${foundCamel.join(', ')}` };
    }
  }

  // ── Rule 3: kubectl / helm command verbs ──────────────────────────────────
  const verbMap = {
    apply: ['k apply', 'kubectl apply'],
    applied: ['k apply', 'kubectl apply'],
    create: ['k create', 'kubectl create', 'k run', 'kubectl run'],
    created: ['k create', 'kubectl create', 'k run', 'kubectl run'],
    delete: ['k delete', 'kubectl delete'],
    scale: ['k scale', 'kubectl scale'],
    expose: ['k expose', 'kubectl expose'],
    install: ['helm install'],
    upgrade: ['helm upgrade'],
    label: ['k label', 'kubectl label'],
    annotate: ['k annotate', 'kubectl annotate'],
    edit: ['k edit', 'kubectl edit', 'vim'],
  };

  for (const [verb, patterns] of Object.entries(verbMap)) {
    if (!cLow.includes(verb)) continue;
    const matched = patterns.find((p) => qCmds.includes(p) || allCmds.includes(p));
    if (matched) {
      return { auto: true, confidence: 'medium', reason: `Command found: ${matched}` };
    }
  }

  // ── Rule 4: Quoted/backtick values in criterion ───────────────────────────
  const quotedVals = [...(criterion.match(/"([^"]+)"/g) || []), ...(criterion.match(/`([^`]+)`/g) || [])]
    .map((v) => v.replace(/["`]/g, '').toLowerCase());

  if (quotedVals.length > 0) {
    const found = quotedVals.filter((v) => broadEvidence.includes(v));
    if (found.length === quotedVals.length) {
      return { auto: true, confidence: 'medium', reason: `Values found: ${found.join(', ')}` };
    }
  }

  // ── Rule 5: k8s resource kind names in criterion + any kubectl command ────
  const k8sKinds = ['deployment', 'pod', 'service', 'configmap', 'secret', 'ingress',
    'networkpolicy', 'persistentvolumeclaim', 'serviceaccount', 'role',
    'rolebinding', 'clusterrole', 'clusterrolebinding', 'cronjob', 'job',
    'daemonset', 'statefulset', 'replicaset'];

  const mentionedKinds = k8sKinds.filter((k) => cLow.includes(k));
  const hasKubectl = qCmds.includes('kubectl') || qCmds.includes(' k ') || qCmds.startsWith('k ');
  if (mentionedKinds.length > 0 && hasKubectl) {
    const kindInCmds = mentionedKinds.some((k) => qCmds.includes(k));
    if (kindInCmds) {
      return { auto: true, confidence: 'low', reason: `kubectl + ${mentionedKinds[0]} found in history` };
    }
  }

  return { auto: false };
}

// ─── Review Mode ─────────────────────────────────────────────────────────────

function navigateReviewQuestion(dir) {
  const total = state.exam.questions.length;
  const next = state.currentQuestion + dir;
  if (next < 0 || next >= total) return;
  state.currentQuestion = next;
  renderReviewQuestion();
}

function renderReviewQuestion() {
  const q = state.exam.questions[state.currentQuestion];
  const a = state.answers ? state.answers.find((ans) => ans.number === q.number) : null;

  $('#reviewQNum').textContent = q.number;
  updateDropdownHighlight('reviewQuestionDropdown');

  $('#reviewQuestionBody').innerHTML = marked.parse(`**Question ${q.number} | ${q.title}** (Weight: ${q.weight}%)\n\n${q.body}`);

  if (a) {
    const bodyWithoutCriteria = a.body.replace(/- \[ \] .+/g, '').trim();
    $('#reviewAnswerBody').innerHTML = marked.parse(bodyWithoutCriteria);

    if (a.criteria.length > 0) {
      const saved = state.reviewScores[q.number] || {};
      const autoMap = state.autoScored[q.number] || {};

      const autoCount = a.criteria.filter((_, i) => autoMap[i] && autoMap[i].auto).length;
      const summaryHtml = autoCount > 0
        ? `<div class="auto-score-summary">
            <span>&#x1F50D; ${autoCount} of ${a.criteria.length} criteria auto-detected from your terminal history &amp; files</span>
           </div>`
        : '';

      $('#reviewCriteria').innerHTML = summaryHtml + a.criteria
        .map((c, i) => {
          const isChecked = !!saved[i];
          const autoInfo = autoMap[i] || {};
          const isAuto = autoInfo.auto && isChecked;
          const confidenceClass = isAuto ? `auto-${autoInfo.confidence}` : '';
          const badge = isAuto
            ? `<span class="auto-badge ${confidenceClass}" title="${escapeHtml(autoInfo.reason || '')}">auto</span>`
            : '';
          return `
            <label class="criteria-item ${isChecked ? 'checked' : ''} ${isAuto ? 'auto-checked' : ''}">
              <input type="checkbox" data-q="${q.number}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
              <span>${c}</span>${badge}
            </label>`;
        })
        .join('');

      $('#reviewCriteria')
        .querySelectorAll('input[type="checkbox"]')
        .forEach((cb) => {
          cb.addEventListener('change', onCriteriaChange);
        });
    } else {
      $('#reviewCriteria').innerHTML = '<p style="color:#999">No scoring criteria defined for this question.</p>';
    }
  } else {
    $('#reviewAnswerBody').innerHTML = '<p style="color:#999">No answer available for this question.</p>';
    $('#reviewCriteria').innerHTML = '';
  }

  updateScore();
}

function onCriteriaChange(e) {
  const qNum = parseInt(e.target.dataset.q);
  const idx = parseInt(e.target.dataset.idx);
  if (!state.reviewScores[qNum]) state.reviewScores[qNum] = {};
  state.reviewScores[qNum][idx] = e.target.checked;
  e.target.closest('.criteria-item').classList.toggle('checked', e.target.checked);
  updateScore();
}

function updateScore() {
  if (!state.answers || !state.exam) return;

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const q of state.exam.questions) {
    const a = state.answers.find((ans) => ans.number === q.number);
    if (!a || a.criteria.length === 0) continue;

    totalWeight += q.weight;
    const scored = state.reviewScores[q.number] || {};
    const checkedCount = Object.values(scored).filter(Boolean).length;
    const ratio = checkedCount / a.criteria.length;
    earnedWeight += q.weight * ratio;
  }

  const percentage = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  $('#scoreDisplay').textContent = percentage;

  const scoreEl = $('#scoreDisplay').parentElement;
  scoreEl.style.color = percentage >= (state.exam.passPercentage || 66) ? 'var(--accent-green)' : 'var(--accent-red)';
}

// ─── Back to Home ────────────────────────────────────────────────────────────

function backToHome() {
  clearInterval(state.timerInterval);
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  destroyAllTerminals();
  state.exam = null;
  state.answers = null;
  state.reviewScores = {};
  state.flagged = new Set();
  state.evidence = null;
  state.autoScored = {};
  showScreen('landing');
  loadExamList();
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attachCopyHandlers(container) {
  container.querySelectorAll('code').forEach((el) => {
    el.style.cursor = 'pointer';
    el.title = 'Click to copy';
    el.addEventListener('click', async () => {
      const text = el.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showCopyToast(el, text);
    });
  });
}

function showCopyToast(anchor, text) {
  const existing = document.getElementById('copyToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'copyToast';
  toast.textContent = `Copied: ${text.length > 30 ? text.slice(0, 30) + '…' : text}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #238636;
    color: #fff;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px;
    font-family: monospace;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: fadeInUp 0.15s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
}
