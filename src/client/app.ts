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
import { navigateReviewQuestion, backToHome } from './screens/review.js';
import { fitActiveTerminal } from './terminal.js';
import { saveSession, attachPersistenceHooks } from './session-persistence.js';
import {
  initResizer,
  initPanelTabs,
  toggleDropdown,
  hideModal,
  closeDropdowns,
} from './ui.js';

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.onTimerExpired = () => endExamFromModal();
  attachPersistenceHooks(state, () => saveSession(state));

  loadExamList(startExam);
  bindEvents();
  window.addEventListener('resize', () => fitActiveTerminal());
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
    loadExamList(startExam);
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
