import { state } from '../state.js';
import { $, $$, attachCopyHandlers } from '../utils.js';
import { fetchExam, fetchAnswers, resetSandbox, fetchEvidence } from '../api.js';
import { showScreen, showModal, hideModal, updateDropdownHighlight, showGlobalLoading, updateGlobalLoading, hideGlobalLoading } from '../ui.js';
import { startTimer, stopTimer } from '../timer.js';
import { connectWebSocket, destroyAllTerminals, closeWebSocket, ensureTerminal } from '../terminal.js';
import { saveSession, clearSession, applySavedSession } from '../session-persistence.js';
import { updateQuestionProgress } from '../practice-progress.js';
import { scorePracticeQuestion, renderPracticeFeedback } from '../scoring/practice.js';
import { enterReviewMode, backToHome, renderReviewQuestion } from './review.js';
import { navigateTo, syncRouteFromState } from '../router.js';
import { showToast } from '../toast.js';
import type { SavedSession } from '../types.js';

export function isPracticeMode() {
  return state.mode === 'practice';
}

export async function startExam(examId: string, savedSession: SavedSession | null = null, questionIndex?: number) {
  try {
    if (!savedSession) {
      showGlobalLoading('Preparing exam environment (resetting workspace and cluster namespaces)…');
      await resetSandbox(examId);
    } else {
      showGlobalLoading('Restoring session…');
    }

    updateGlobalLoading('Loading exam content…');

    state.exam = await fetchExam(examId);
    state.mode = state.exam.group === 'practice' ? 'practice' : 'exam';
    state.reviewMode = 'exam';
    state.currentQuestion = 0;
    state.flagged = new Set();
    state.timerSeconds = state.exam.duration * 60;
    state.reviewScores = {};
    state.practiceResults = {};
    state.autoScored = {};
    state.evidence = null;

    if (savedSession) {
      applySavedSession(state, savedSession);
      showToast('Session restored', 'info');
    } else if (typeof questionIndex === 'number' && questionIndex >= 0) {
      state.currentQuestion = Math.min(questionIndex, state.exam.questions.length - 1);
    }

    state.answers = await fetchAnswers(examId);

    $('#examTitle').textContent = state.exam.title;
    $('#totalQNum').textContent = String(state.exam.questions.length);
    $('#reviewTotalQNum').textContent = String(state.exam.questions.length);

    updateModeUI();
    connectWebSocket();
    buildQuestionDropdown();
    showScreen('exam');
    renderQuestion();
    if (state.mode === 'exam') startTimer();
    else stopTimer();

    saveSession(state);
    syncRouteFromState(state);
  } catch (err) {
    alert('Failed to load exam: ' + (err as Error).message);
    document.querySelectorAll('.exam-card.starting').forEach((c) => c.classList.remove('starting'));
  } finally {
    hideGlobalLoading();
  }
}

export function updateModeUI() {
  const practice = isPracticeMode();
  $('#footerExam').classList.toggle('hidden', practice);
  $('#footerPractice').classList.toggle('hidden', !practice);
  $('#btnEndExam').classList.toggle('hidden', practice);
  $('#btnFinishPractice').classList.toggle('hidden', !practice);
  $('#timerWrap').classList.toggle('hidden', practice);
  $('#btnFlag').classList.toggle('hidden', practice);
  $('#btnShowHint')?.classList.toggle('hidden', !practice);

  const lastQ = state.exam && state.currentQuestion === state.exam.questions.length - 1;
  $('#btnNextPractice').textContent = lastQ ? 'Finish →' : 'Next →';
}

function hidePracticeFeedback() {
  $('#practiceFeedback').classList.add('hidden');
  $('#practiceHint')?.classList.add('hidden');
}

function showPracticeFeedback() {
  $('#practiceFeedback').classList.remove('hidden');
}

function updateBreadcrumb(): void {
  if (!state.exam) return;
  const q = state.exam.questions[state.currentQuestion];
  const el = $('#examBreadcrumb');
  if (!q) {
    el.innerHTML = '';
    return;
  }
  const mode = isPracticeMode() ? 'Practice' : 'Mock Exam';
  el.innerHTML = `
    <span>${mode}</span>
    <span class="sep">/</span>
    <span>${state.exam.title}</span>
    <span class="sep">/</span>
    <span class="crumb-current">Q${q.number}</span>
  `;
}

/**
 * Derive a short hint from an answer body: the first real command inside the
 * first fenced code block. Falls back to the first prose line that is neither a
 * markdown emphasis marker nor a fence delimiter. Returns a markdown string so
 * the caller can render it through `marked` — never a raw ``` fence line, which
 * is what the old textContent-based heuristic used to leak onto the screen.
 */
function deriveHintMarkdown(body: string): string {
  const lines = body.split('\n');
  const fenceStart = lines.findIndex((l) => l.trim().startsWith('```'));
  if (fenceStart !== -1) {
    for (let i = fenceStart + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('```')) break; // end of block, no command found
      if (!line || line.startsWith('#')) continue; // skip blanks and comments
      return '```bash\n' + line + '\n```';
    }
  }
  const prose = lines
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('**') && !l.startsWith('```') && !l.startsWith('- ['));
  return (prose || '').replace(/^#+\s*/, '').slice(0, 200);
}

function bindHintButton(answer: import('../types.js').AnswerEntry | null | undefined): void {
  const btn = $('#btnShowHint');
  const hintEl = $('#practiceHint');
  if (!btn || !hintEl) return;

  btn.onclick = () => {
    if (!answer) {
      hintEl.textContent = 'No hint available for this question.';
    } else {
      hintEl.innerHTML = marked.parse(deriveHintMarkdown(answer.body));
    }
    hintEl.classList.remove('hidden');
    showToast('Hint revealed', 'info', 1500);
  };
}

export function navigateQuestion(dir: number): void {
  if (!state.exam) return;
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
  saveSession(state);
  syncRouteFromState(state);
}

export function goToQuestion(idx: number): void {
  state.currentQuestion = idx;
  hidePracticeFeedback();
  renderQuestion();
  updateModeUI();
  $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
  saveSession(state);
  syncRouteFromState(state);
}

export function renderQuestion(): void {
  if (!state.exam) return;
  const q = state.exam.questions[state.currentQuestion];
  if (!q) return;

  $('#currentQNum').textContent = String(q.number);
  $('#questionWeight').textContent = isPracticeMode() ? 'Practice' : `Weight: ${q.weight}%`;
  updateBreadcrumb();

  const answer = state.answers?.find((ans) => ans.number === q.number) || null;
  if (isPracticeMode()) {
    bindHintButton(answer);
    $('#practiceHint')?.classList.add('hidden');
  }

  const ctxEl = $('#questionContext');
  if (q.context) {
    ctxEl.textContent = q.context;
    ctxEl.classList.add('visible');
  } else {
    ctxEl.classList.remove('visible');
  }

  const nsEl = $('#questionNamespace');
  if (q.namespace) {
    nsEl.innerHTML = `Namespace <code>${q.namespace}</code>`;
    nsEl.classList.remove('hidden');
    attachCopyHandlers(nsEl);
  } else {
    nsEl.classList.add('hidden');
    nsEl.innerHTML = '';
  }

  $('#questionBody').innerHTML = marked.parse(q.body);
  attachCopyHandlers($('#questionBody'));

  const flagBtn = $('#btnFlag');
  flagBtn.classList.toggle('flagged', state.flagged.has(state.currentQuestion));

  updateDropdownHighlight('questionDropdown');
  ensureTerminal(state.currentQuestion);
  updateModeUI();

  if (isPracticeMode() && state.practiceResults[q.number]) {
    renderPracticeFeedback(state.practiceResults[q.number], answer);
    showPracticeFeedback();
  } else {
    hidePracticeFeedback();
  }
}

export function toggleFlag() {
  const idx = state.currentQuestion;
  if (state.flagged.has(idx)) state.flagged.delete(idx);
  else state.flagged.add(idx);
  $('#btnFlag').classList.toggle('flagged', state.flagged.has(idx));
  buildQuestionDropdown();
  saveSession(state);
}

export function buildQuestionDropdown(): void {
  if (!state.exam) return;
  const html = state.exam.questions
    .map(
      (q, i) => `
    <div class="dropdown-item ${i === state.currentQuestion ? 'active' : ''}" data-idx="${i}">
      <span class="q-num">${q.number}</span>
      <span class="q-title">${q.title}</span>
      <span class="q-weight">${q.weight}%</span>
      ${state.flagged.has(i) ? '<span class="q-flag-dot" title="Flagged"></span>' : ''}
      ${isPracticeMode() && state.practiceResults[q.number] ? '<span class="q-flag" style="color:var(--accent-green)">✓</span>' : ''}
    </div>
  `
    )
    .join('');

  $('#questionDropdown').innerHTML = html;
  $('#questionDropdown')
    .querySelectorAll('.dropdown-item')
    .forEach((item: Element) => {
      item.addEventListener('click', () => goToQuestion(parseInt((item as HTMLElement).dataset.idx ?? '0', 10)));
    });

  $('#reviewQuestionDropdown').innerHTML = html;
  $('#reviewQuestionDropdown')
    .querySelectorAll('.dropdown-item')
    .forEach((item: Element) => {
      item.addEventListener('click', () => {
        state.currentQuestion = parseInt((item as HTMLElement).dataset.idx ?? '0', 10);
        renderReviewQuestion();
        $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
      });
    });
}

export function showEndExamModal() {
  if (isPracticeMode()) {
    finishPractice();
    return;
  }
  const flagged = state.flagged.size;
  showModal(
    'End Exam?',
    `Are you sure you want to end the exam?${flagged > 0 ? ` You have ${flagged} flagged question(s).` : ''} You will enter review mode.`
  );
}

export async function endExamFromModal() {
  hideModal();
  stopTimer();
  closeWebSocket();
  destroyAllTerminals();

  if (!state.answers || state.answers.length === 0) {
    alert('No answers available for this exam. Returning to home.');
    backToHome();
    return;
  }

  state.evidence = await fetchEvidence(state.exam!.questions.map((_, i) => i));
  await enterReviewMode('exam');
  saveSession(state);
}

export async function finishPractice() {
  stopTimer();
  closeWebSocket();
  destroyAllTerminals();

  if (!state.answers || state.answers.length === 0) {
    alert('No answers available for this module. Returning to home.');
    backToHome();
    return;
  }

  await enterReviewMode('practice-summary');
  saveSession(state);
}

export async function checkPracticeAnswer(): Promise<void> {
  if (!state.exam) return;
  const q = state.exam.questions[state.currentQuestion];
  const answer = state.answers?.find((a) => a.number === q.number);
  if (!answer) {
    alert('No answer available for this question.');
    return;
  }

  ($('#btnCheckAnswer') as HTMLButtonElement).disabled = true;
  $('#btnCheckAnswer').textContent = 'Checking…';

  state.evidence = await fetchEvidence(state.currentQuestion);

  const result = scorePracticeQuestion(state.currentQuestion, answer, state.evidence);
  state.practiceResults[q.number] = result;

  if (isPracticeMode() && state.exam) {
    updateQuestionProgress(state.exam.id, q.number, result, state.exam.passPercentage || 66);
  }

  renderPracticeFeedback(result, answer);
  const feedback = $('#practiceFeedback');
  feedback.classList.remove('hidden', 'shake', 'confetti');
  if (result.scorePercent === 100) {
    feedback.classList.add('confetti');
    showToast('Perfect score!', 'success');
  } else if (result.scorePercent < 50) {
    feedback.classList.add('shake');
  }

  ($('#btnCheckAnswer') as HTMLButtonElement).disabled = false;
  $('#btnCheckAnswer').textContent = 'Check Again';
  document.getElementById('tabQuestion')!.scrollTop = 0;
  saveSession(state);
}
