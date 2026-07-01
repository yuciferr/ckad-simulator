import { state } from './state.js';
import { $, $$, capitalize, escapeHtml, attachCopyHandlers, showCopyToast, pad } from './utils.js';
import { scorePracticeQuestion, renderPracticeFeedback } from './scoring/practice.js';
import { autoScoreAll } from './scoring/mock.js';

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
  $('#btnCheckAnswer').addEventListener('click', checkPracticeAnswer);
  $('#btnNextPractice').addEventListener('click', () => navigateQuestion(1));
  $('#btnEndExam').addEventListener('click', showEndExamModal);
  $('#btnFinishPractice').addEventListener('click', finishPractice);
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
    state.mode = state.exam.group === 'practice' ? 'practice' : 'exam';
    state.reviewMode = 'exam';
    state.currentQuestion = 0;
    state.flagged = new Set();
    state.timerSeconds = state.exam.duration * 60;
    state.reviewScores = {};
    state.practiceResults = {};
    state.autoScored = {};
    state.evidence = null;

    try {
      const ansRes = await fetch(`/api/exams/${examId}/answers`);
      if (ansRes.ok) state.answers = await ansRes.json();
    } catch {
      state.answers = null;
    }

    $('#examTitle').textContent = state.exam.title;
    $('#totalQNum').textContent = state.exam.questions.length;
    $('#reviewTotalQNum').textContent = state.exam.questions.length;

    updateModeUI();
    connectWebSocket();
    buildQuestionDropdown();
    showScreen('exam');
    renderQuestion();
    if (state.mode === 'exam') startTimer();
    else clearInterval(state.timerInterval);
  } catch (err) {
    alert('Failed to load exam: ' + err.message);
  }
}

function isPracticeMode() {
  return state.mode === 'practice';
}

function updateModeUI() {
  const practice = isPracticeMode();
  $('#footerExam').classList.toggle('hidden', practice);
  $('#footerPractice').classList.toggle('hidden', !practice);
  $('#btnEndExam').classList.toggle('hidden', practice);
  $('#btnFinishPractice').classList.toggle('hidden', !practice);
  $('#timer').classList.toggle('hidden', practice);
  $('#btnFlag').classList.toggle('hidden', practice);

  const lastQ = state.exam && state.currentQuestion === state.exam.questions.length - 1;
  $('#btnNextPractice').textContent = lastQ ? 'Finish →' : 'Next →';
}

function hidePracticeFeedback() {
  $('#practiceFeedback').classList.add('hidden');
}

function showPracticeFeedback() {
  $('#practiceFeedback').classList.remove('hidden');
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

  if (isPracticeMode() && dir > 0 && next >= total) {
    finishPractice();
    return;
  }

  if (next < 0 || next >= total) return;
  state.currentQuestion = next;
  hidePracticeFeedback();
  renderQuestion();
  updateModeUI();
}

function goToQuestion(idx) {
  state.currentQuestion = idx;
  hidePracticeFeedback();
  renderQuestion();
  updateModeUI();
  $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
}

function renderQuestion() {
  const q = state.exam.questions[state.currentQuestion];
  if (!q) return;

  $('#currentQNum').textContent = q.number;
  $('#questionWeight').textContent = isPracticeMode() ? 'Practice' : `Weight: ${q.weight}%`;

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
  updateModeUI();

  if (isPracticeMode() && state.practiceResults[q.number]) {
    const answer = state.answers?.find((ans) => ans.number === q.number) || null;
    renderPracticeFeedback(state.practiceResults[q.number], answer);
    showPracticeFeedback();
  } else {
    hidePracticeFeedback();
  }
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
      ${isPracticeMode() && state.practiceResults[q.number] ? '<span class="q-flag" style="color:var(--accent-green)">✓</span>' : ''}
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
  if (isPracticeMode()) {
    finishPractice();
    return;
  }
  const unanswered = state.flagged.size;
  $('#modalTitle').textContent = 'End Exam?';
  $('#modalBody').textContent = `Are you sure you want to end the exam?${unanswered > 0 ? ` You have ${unanswered} flagged question(s).` : ''} You will enter review mode.`;
  $('#modalOverlay').classList.add('open');
}

function hideModal() {
  $('#modalOverlay').classList.remove('open');
}

async function collectEvidence() {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch('/api/session/evidence');
    if (res.ok) {
      state.evidence = await res.json();
      return state.evidence;
    }
  } catch { /* ignore */ }
  return state.evidence;
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

  await collectEvidence();
  autoScoreAll(state);

  state.reviewMode = 'exam';
  state.currentQuestion = 0;
  showScreen('review');
  updateReviewHeader();
  renderReviewQuestion();
}

async function finishPractice() {
  clearInterval(state.timerInterval);

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  destroyAllTerminals();

  if (!state.answers || state.answers.length === 0) {
    alert('No answers available for this module. Returning to home.');
    backToHome();
    return;
  }

  state.reviewMode = 'practice-summary';
  state.currentQuestion = 0;
  showScreen('review');
  updateReviewHeader();
  renderReviewQuestion();
}

async function checkPracticeAnswer() {
  const q = state.exam.questions[state.currentQuestion];
  const answer = state.answers?.find((a) => a.number === q.number);
  if (!answer) {
    alert('No answer available for this question.');
    return;
  }

  $('#btnCheckAnswer').disabled = true;
  $('#btnCheckAnswer').textContent = 'Checking…';

  await collectEvidence();

  const result = scorePracticeQuestion(state.currentQuestion, answer, state.evidence);
  state.practiceResults[q.number] = result;

  renderPracticeFeedback(result, answer);
  showPracticeFeedback();

  $('#btnCheckAnswer').disabled = false;
  $('#btnCheckAnswer').textContent = 'Check Again';
  document.getElementById('tabQuestion').scrollTop = 0;
}

function updateReviewHeader() {
  const label = document.querySelector('#review .topbar-left span:last-child');
  if (label) {
    label.textContent = state.reviewMode === 'practice-summary' ? 'Practice Summary' : 'Review Mode';
    label.classList.toggle('practice', state.reviewMode === 'practice-summary');
  }

  const scoreWrap = $('#scoreDisplay').parentElement;
  if (state.reviewMode === 'practice-summary') {
    scoreWrap.style.display = '';
  }
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

  if (state.reviewMode === 'practice-summary') {
    $('#reviewCriteriaTitle').textContent = 'Your Steps';
    renderPracticeSummaryReview(q, a);
    updatePracticeSummaryScore();
    return;
  }

  $('#reviewCriteriaTitle').textContent = 'Scoring Criteria';

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

function renderPracticeSummaryReview(q, a) {
  const result = state.practiceResults[q.number];

  if (a) {
    const solutionHtml = a.body
      .replace(/\*\*Question:\*\*[^\n]*\n*/i, '')
      .replace(/\*\*Solution:\*\*\s*/i, '')
      .trim();
    $('#reviewAnswerBody').innerHTML = marked.parse(solutionHtml);
  } else {
    $('#reviewAnswerBody').innerHTML = '<p style="color:#999">No answer available.</p>';
  }

  if (!result) {
    $('#reviewCriteria').innerHTML = '<p style="color:#999">This question was not checked. Go back to the module to practice it.</p>';
    return;
  }

  const statusLabel = result.total === 0
    ? 'Manual review'
    : `${result.scorePercent}% — ${result.passed}/${result.total} steps correct`;

  $('#reviewCriteria').innerHTML = `
    <div class="auto-score-summary">
      <span>Result: ${statusLabel}</span>
    </div>
    ${result.checks
      .map((check) => {
        const icon = check.pass === true ? '✅' : check.pass === false ? '❌' : 'ℹ️';
        const cls = check.pass === true ? 'checked' : '';
        return `
          <div class="criteria-item ${cls}" style="cursor:default">
            <span>${icon}</span>
            <span style="font-family:monospace;font-size:12px">${escapeHtml(check.label)}</span>
          </div>`;
      })
      .join('')}
  `;
}

function updatePracticeSummaryScore() {
  const checked = Object.values(state.practiceResults).filter((r) => r.total > 0);
  if (checked.length === 0) {
    $('#scoreDisplay').textContent = '—';
    return;
  }

  const avg = Math.round(checked.reduce((s, r) => s + r.scorePercent, 0) / checked.length);
  $('#scoreDisplay').textContent = avg;

  const scoreEl = $('#scoreDisplay').parentElement;
  scoreEl.style.color = avg >= (state.exam.passPercentage || 66) ? 'var(--accent-green)' : 'var(--accent-orange)';
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
  state.mode = 'exam';
  state.reviewMode = 'exam';
  state.reviewScores = {};
  state.practiceResults = {};
  state.flagged = new Set();
  state.evidence = null;
  state.autoScored = {};
  hidePracticeFeedback();
  $('#btnCheckAnswer').textContent = 'Check Answer';
  showScreen('landing');
  loadExamList();
}
