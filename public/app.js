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
}

// ─── Exam List ───────────────────────────────────────────────────────────────

async function loadExamList() {
  try {
    const res = await fetch('/api/exams');
    const exams = await res.json();

    const container = $('#examList');
    if (exams.length === 0) {
      container.innerHTML = '<div class="loading">No exams found. Add exam files to the /exams directory.</div>';
      return;
    }

    container.innerHTML = exams
      .map(
        (e) => `
      <button class="exam-card" data-exam-id="${e.id}" aria-label="Start ${e.title}">
        <div class="exam-card-title">${e.title}</div>
        <div class="exam-card-meta">
          <span>⏱ ${e.duration} minutes</span>
          <span>📋 Pass: ${e.passPercentage}%</span>
          <span>${e.hasAnswer ? '✅ Answers available' : '⚠️ No answers'}</span>
        </div>
      </button>
    `
      )
      .join('');

    container.querySelectorAll('.exam-card').forEach((card) => {
      card.addEventListener('click', () => startExam(card.dataset.examId));
    });
  } catch (err) {
    $('#examList').innerHTML = `<div class="loading">Error loading exams: ${err.message}</div>`;
  }
}

// ─── Start Exam ──────────────────────────────────────────────────────────────

async function startExam(examId) {
  try {
    await fetch('/api/sandbox/reset', { method: 'POST' });

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

function endExam() {
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

  state.currentQuestion = 0;
  showScreen('review');
  renderReviewQuestion();
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
      $('#reviewCriteria').innerHTML = a.criteria
        .map(
          (c, i) => `
        <label class="criteria-item ${saved[i] ? 'checked' : ''}">
          <input type="checkbox" data-q="${q.number}" data-idx="${i}" ${saved[i] ? 'checked' : ''}>
          <span>${c}</span>
        </label>
      `
        )
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
  showScreen('landing');
  loadExamList();
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
