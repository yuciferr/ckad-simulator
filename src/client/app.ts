import { state } from './state.js';
import { $ } from './utils.js';
import { loadExamList } from './screens/landing.js';
import {
  startExam,
  navigateQuestion,
  toggleFlag,
  showEndExamModal,
  endExamFromModal,
  checkPracticeAnswer,
  finishPractice,
} from './screens/exam-screen.js';
import { navigateReviewQuestion, backToHome, resumeReviewFromRoute } from './screens/review.js';
import { fitActiveTerminal } from './terminal.js';
import { saveSession, attachPersistenceHooks, loadSavedSession } from './session-persistence.js';
import { parseRoute } from './router.js';
import {
  initResizer,
  initPanelTabs,
  toggleDropdown,
  hideModal,
  closeDropdowns,
} from './ui.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  state.onTimerExpired = () => endExamFromModal();
  attachPersistenceHooks(state, () => saveSession(state));

  window.addEventListener('popstate', () => {
    void handleRouteChange(false);
  });

  bindEvents();
  window.addEventListener('resize', () => fitActiveTerminal());
  await handleRouteChange(true);
}

async function handleRouteChange(isInitial: boolean) {
  const route = parseRoute();

  if (route.screen === 'landing') {
    if (state.currentScreen !== 'landing' || isInitial) {
      backToHome({ skipRoute: true });
      await loadExamList(startExam);
    }
    return;
  }

  const saved = loadSavedSession();
  const canResume = saved && saved.examId === route.examId;

  if (route.screen === 'exam') {
    if (state.exam?.id === route.examId && state.currentScreen === 'exam') {
      return;
    }
    const session = canResume ? { ...saved, currentQuestion: route.questionIndex } : null;
    if (canResume || isInitial) {
      await startExam(route.examId, session, route.questionIndex);
    } else {
      await startExam(route.examId, null, route.questionIndex);
    }
    return;
  }

  if (route.screen === 'review') {
    if (!canResume) {
      backToHome({ skipRoute: true });
      await loadExamList(startExam);
      return;
    }
    await resumeReviewFromRoute(route.examId, route.questionIndex, route.reviewMode, saved);
  }
}

function bindEvents() {
  $('#btnPrev').addEventListener('click', () => navigateQuestion(-1));
  $('#btnNext').addEventListener('click', () => navigateQuestion(1));
  $('#btnSatisfied').addEventListener('click', () => navigateQuestion(1));
  $('#btnCheckAnswer').addEventListener('click', checkPracticeAnswer);
  $('#btnNextPractice').addEventListener('click', () => navigateQuestion(1));
  $('#btnEndExam').addEventListener('click', showEndExamModal);
  $('#btnFinishPractice').addEventListener('click', finishPractice);
  $('#btnFlag').addEventListener('click', toggleFlag);
  $('#btnQuestionList').addEventListener('click', () => toggleDropdown('questionDropdown'));
  $('#btnReviewQuestionList').addEventListener('click', () => toggleDropdown('reviewQuestionDropdown'));
  $('#btnReviewPrev').addEventListener('click', () => navigateReviewQuestion(-1));
  $('#btnReviewNext').addEventListener('click', () => navigateReviewQuestion(1));
  $('#btnBackToHome').addEventListener('click', () => {
    backToHome();
    void loadExamList(startExam);
  });
  $('#modalCancel').addEventListener('click', hideModal);
  $('#modalConfirm').addEventListener('click', endExamFromModal);

  initResizer(fitActiveTerminal);
  initPanelTabs();

  document.addEventListener('click', (e) => {
    if (!(e.target as Element)?.closest?.('.question-dropdown')) closeDropdowns();
  });
}

export { backToHome, loadExamList, startExam };
