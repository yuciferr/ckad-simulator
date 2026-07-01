import { state } from '../state.js';
import { $, escapeHtml } from '../utils.js';
import { showScreen, updateDropdownHighlight } from '../ui.js';
import { stopTimer } from '../timer.js';
import { destroyAllTerminals, closeWebSocket } from '../terminal.js';
import { clearSession } from '../session-persistence.js';
import { autoScoreAll } from '../scoring/mock.js';

export async function enterReviewMode(mode) {
  if (mode === 'exam') {
    autoScoreAll(state);
  }

  state.reviewMode = mode;
  state.currentQuestion = 0;
  showScreen('review');
  updateReviewHeader();
  renderReviewQuestion();
}

export function navigateReviewQuestion(dir) {
  const total = state.exam.questions.length;
  const next = state.currentQuestion + dir;
  if (next < 0 || next >= total) return;
  state.currentQuestion = next;
  renderReviewQuestion();
}

export function renderReviewQuestion() {
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
  const qNum = parseInt(e.target.dataset.q, 10);
  const idx = parseInt(e.target.dataset.idx, 10);
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

export function backToHome() {
  stopTimer();
  closeWebSocket();
  destroyAllTerminals();
  clearSession();
  state.exam = null;
  state.answers = null;
  state.mode = 'exam';
  state.reviewMode = 'exam';
  state.reviewScores = {};
  state.practiceResults = {};
  state.flagged = new Set();
  state.evidence = null;
  state.autoScored = {};
  $('#practiceFeedback')?.classList.add('hidden');
  $('#btnCheckAnswer').textContent = 'Check Answer';
  showScreen('landing');
}
