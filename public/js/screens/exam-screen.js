import { state } from '../state.js';
import { $, $$, attachCopyHandlers } from '../utils.js';
import { fetchExam, fetchAnswers, resetSandbox, fetchEvidence } from '../api.js';
import { showScreen, showModal, hideModal, updateDropdownHighlight } from '../ui.js';
import { startTimer, stopTimer } from '../timer.js';
import { connectWebSocket, destroyAllTerminals, closeWebSocket, ensureTerminal } from '../terminal.js';
import { saveSession, clearSession, applySavedSession } from '../session-persistence.js';
import { updateQuestionProgress } from '../practice-progress.js';
import { scorePracticeQuestion, renderPracticeFeedback } from '../scoring/practice.js';
import { enterReviewMode, backToHome, renderReviewQuestion } from './review.js';
export function isPracticeMode() {
    return state.mode === 'practice';
}
export async function startExam(examId, savedSession = null) {
    try {
        if (!savedSession) {
            await resetSandbox(examId);
        }
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
        }
        state.answers = await fetchAnswers(examId);
        $('#examTitle').textContent = state.exam.title;
        $('#totalQNum').textContent = state.exam.questions.length;
        $('#reviewTotalQNum').textContent = state.exam.questions.length;
        updateModeUI();
        connectWebSocket();
        buildQuestionDropdown();
        showScreen('exam');
        renderQuestion();
        if (state.mode === 'exam')
            startTimer();
        else
            stopTimer();
        saveSession(state);
    }
    catch (err) {
        alert('Failed to load exam: ' + err.message);
    }
}
export function updateModeUI() {
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
export function navigateQuestion(dir) {
    const total = state.exam.questions.length;
    const next = state.currentQuestion + dir;
    if (isPracticeMode() && dir > 0 && next >= total) {
        finishPractice();
        return;
    }
    if (next < 0 || next >= total)
        return;
    state.currentQuestion = next;
    hidePracticeFeedback();
    renderQuestion();
    updateModeUI();
    saveSession(state);
}
export function goToQuestion(idx) {
    state.currentQuestion = idx;
    hidePracticeFeedback();
    renderQuestion();
    updateModeUI();
    $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
    saveSession(state);
}
export function renderQuestion() {
    const q = state.exam.questions[state.currentQuestion];
    if (!q)
        return;
    $('#currentQNum').textContent = q.number;
    $('#questionWeight').textContent = isPracticeMode() ? 'Practice' : `Weight: ${q.weight}%`;
    const ctxEl = $('#questionContext');
    if (q.context) {
        ctxEl.textContent = q.context;
        ctxEl.classList.add('visible');
    }
    else {
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
    }
    else {
        hidePracticeFeedback();
    }
}
export function toggleFlag() {
    const idx = state.currentQuestion;
    if (state.flagged.has(idx))
        state.flagged.delete(idx);
    else
        state.flagged.add(idx);
    $('#btnFlag').classList.toggle('flagged', state.flagged.has(idx));
    buildQuestionDropdown();
    saveSession(state);
}
export function buildQuestionDropdown() {
    const html = state.exam.questions
        .map((q, i) => `
    <div class="dropdown-item ${i === state.currentQuestion ? 'active' : ''}" data-idx="${i}">
      <span class="q-num">${q.number}</span>
      <span class="q-title">${q.title}</span>
      <span class="q-weight">${q.weight}%</span>
      ${state.flagged.has(i) ? '<span class="q-flag">⚑</span>' : ''}
      ${isPracticeMode() && state.practiceResults[q.number] ? '<span class="q-flag" style="color:var(--accent-green)">✓</span>' : ''}
    </div>
  `)
        .join('');
    $('#questionDropdown').innerHTML = html;
    $('#questionDropdown')
        .querySelectorAll('.dropdown-item')
        .forEach((item) => {
        item.addEventListener('click', () => goToQuestion(parseInt(item.dataset.idx, 10)));
    });
    $('#reviewQuestionDropdown').innerHTML = html;
    $('#reviewQuestionDropdown')
        .querySelectorAll('.dropdown-item')
        .forEach((item) => {
        item.addEventListener('click', () => {
            state.currentQuestion = parseInt(item.dataset.idx, 10);
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
    showModal('End Exam?', `Are you sure you want to end the exam?${flagged > 0 ? ` You have ${flagged} flagged question(s).` : ''} You will enter review mode.`);
}
export async function endExamFromModal() {
    hideModal();
    stopTimer();
    closeWebSocket();
    destroyAllTerminals();
    clearSession();
    if (!state.answers || state.answers.length === 0) {
        alert('No answers available for this exam. Returning to home.');
        backToHome();
        return;
    }
    state.evidence = await fetchEvidence();
    await enterReviewMode('exam');
}
export async function finishPractice() {
    stopTimer();
    closeWebSocket();
    destroyAllTerminals();
    clearSession();
    if (!state.answers || state.answers.length === 0) {
        alert('No answers available for this module. Returning to home.');
        backToHome();
        return;
    }
    await enterReviewMode('practice-summary');
}
export async function checkPracticeAnswer() {
    const q = state.exam.questions[state.currentQuestion];
    const answer = state.answers?.find((a) => a.number === q.number);
    if (!answer) {
        alert('No answer available for this question.');
        return;
    }
    $('#btnCheckAnswer').disabled = true;
    $('#btnCheckAnswer').textContent = 'Checking…';
    state.evidence = await fetchEvidence();
    const result = scorePracticeQuestion(state.currentQuestion, answer, state.evidence);
    state.practiceResults[q.number] = result;
    if (isPracticeMode()) {
        updateQuestionProgress(state.exam.id, q.number, result, state.exam.passPercentage || 66);
    }
    renderPracticeFeedback(result, answer);
    $('#practiceFeedback').classList.remove('hidden');
    $('#btnCheckAnswer').disabled = false;
    $('#btnCheckAnswer').textContent = 'Check Again';
    document.getElementById('tabQuestion').scrollTop = 0;
    saveSession(state);
}
