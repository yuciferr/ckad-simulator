import { state } from '../state.js';
import { $, escapeHtml } from '../utils.js';
import { fetchExam, fetchAnswers, fetchEvidence, cleanupSandbox } from '../api.js';
import { showScreen, updateDropdownHighlight } from '../ui.js';
import { stopTimer } from '../timer.js';
import { destroyAllTerminals, closeWebSocket } from '../terminal.js';
import {
  clearSession,
  applySavedSession,
  loadSavedSession,
  saveSession,
} from '../session-persistence.js';
import { autoScoreAll } from '../scoring/mock.js';
import { syncRouteFromState, navigateTo } from '../router.js';
import { updateScoreRing } from '../score-ring.js';
import type { SavedSession } from '../types.js';

export async function enterReviewMode(mode: string) {
  if (mode === 'exam') {
    autoScoreAll(state);
  }

  state.reviewMode = mode;
  state.currentQuestion = 0;
  showScreen('review');
  updateReviewHeader();
  renderReviewQuestion();
  syncRouteFromState(state);
  saveSession(state);
}

export function navigateReviewQuestion(dir: number) {
  const total = state.exam!.questions.length;
  const next = state.currentQuestion + dir;
  if (next < 0 || next >= total) return;
  state.currentQuestion = next;
  renderReviewQuestion();
  syncRouteFromState(state);
  saveSession(state);
}

export function renderReviewQuestion(): void {
  if (!state.exam) return;
  const q = state.exam.questions[state.currentQuestion];
  const a = state.answers ? state.answers.find((ans) => ans.number === q.number) : null;

  $('#reviewQNum').textContent = String(q.number);
  updateDropdownHighlight('reviewQuestionDropdown');

  $('#reviewQuestionBody').innerHTML = marked.parse(
    `**Question ${q.number} | ${q.title}** (Weight: ${q.weight}%)\n\n${q.body}`
  );

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
      const summaryHtml =
        autoCount > 0
          ? `<div class="auto-score-summary">
            <span>&#x1F50D; ${autoCount} of ${a.criteria.length} criteria auto-detected from your terminal history &amp; files</span>
           </div>`
          : '';

      $('#reviewCriteria').innerHTML =
        summaryHtml +
        a.criteria
          .map((c, i) => {
            const isChecked = !!saved[i];
            const autoInfo = (autoMap[i] || {}) as {
              auto?: boolean;
              confidence?: string;
              reason?: string;
            };
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
        .forEach((cb: Element) => {
          cb.addEventListener('change', onCriteriaChange);
        });
    } else {
      $('#reviewCriteria').innerHTML =
        '<p style="color:#999">No scoring criteria defined for this question.</p>';
    }
  } else {
    $('#reviewAnswerBody').innerHTML =
      '<p style="color:#999">No answer available for this question.</p>';
    $('#reviewCriteria').innerHTML = '';
  }

  updateScore();
}

function renderPracticeSummaryReview(
  q: import('../types.js').ExamQuestion,
  a: import('../types.js').AnswerEntry | null | undefined
): void {
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
    $('#reviewCriteria').innerHTML =
      '<p style="color:#999">This question was not checked. Go back to the module to practice it.</p>';
    return;
  }

  const statusLabel =
    result.total === 0
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

function setReviewScore(percent: number | null): void {
  const ringEl = document.getElementById('reviewScoreRing');
  if (percent === null) {
    $('#scoreDisplay').textContent = '—';
    if (ringEl) ringEl.innerHTML = '';
    return;
  }
  $('#scoreDisplay').textContent = String(percent);
  if (ringEl) updateScoreRing(ringEl, percent);

  const passAt = state.exam?.passPercentage || 66;
  const color =
    percent >= passAt
      ? 'var(--accent-green)'
      : percent >= 50
        ? 'var(--accent-orange)'
        : 'var(--accent-red)';
  const scoreEl = $('#scoreDisplay').parentElement;
  if (scoreEl) scoreEl.style.color = color;
}

function updatePracticeSummaryScore(): void {
  if (!state.exam) return;
  const checked = Object.values(state.practiceResults).filter((r) => r.total > 0);
  if (checked.length === 0) {
    setReviewScore(null);
    return;
  }

  const avg = Math.round(checked.reduce((s, r) => s + r.scorePercent, 0) / checked.length);
  setReviewScore(avg);
}

function onCriteriaChange(e: Event): void {
  const target = e.target as HTMLInputElement;
  const qNum = parseInt(target.dataset.q ?? '0', 10);
  const idx = parseInt(target.dataset.idx ?? '0', 10);
  if (!state.reviewScores[qNum]) state.reviewScores[qNum] = {};
  state.reviewScores[qNum][idx] = target.checked;
  target.closest('.criteria-item')?.classList.toggle('checked', target.checked);
  updateScore();
}

function updateScore(): void {
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
  setReviewScore(percentage);
}

function updateReviewHeader(): void {
  if (!state.exam) return;
  const label = document.querySelector('#review .topbar-left span:last-child');
  if (label) {
    label.textContent =
      state.reviewMode === 'practice-summary' ? 'Practice Summary' : 'Review Mode';
    label.classList.toggle('practice', state.reviewMode === 'practice-summary');
  }

  const scoreWrap = $('#scoreDisplay').parentElement;
  if (scoreWrap) {
    if (state.reviewMode === 'practice-summary') {
      scoreWrap.style.display = '';
    }
  }
}

export async function resumeReviewFromRoute(
  examId: string,
  questionIndex: number,
  reviewMode: string,
  saved: SavedSession
) {
  state.exam = await fetchExam(examId);
  state.answers = await fetchAnswers(examId);
  applySavedSession(state, saved);
  state.currentQuestion = Math.min(questionIndex, state.exam!.questions.length - 1);
  state.reviewMode = reviewMode;
  state.currentScreen = 'review';

  if (reviewMode === 'exam' && !state.evidence) {
    state.evidence = await fetchEvidence(state.exam!.questions.map((_, i) => i));
    autoScoreAll(state);
  }

  $('#examTitle').textContent = state.exam!.title;
  $('#reviewTotalQNum').textContent = String(state.exam.questions.length);

  showScreen('review');
  updateReviewHeader();
  renderReviewQuestion();
  syncRouteFromState(state);
  saveSession(state);
}

export function backToHome(options: { skipRoute?: boolean } = {}) {
  cleanupSandbox();
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
  if (!options.skipRoute) {
    navigateTo({ screen: 'landing' }, true);
  }
}
