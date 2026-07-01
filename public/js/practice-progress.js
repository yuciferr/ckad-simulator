const PROGRESS_KEY = 'ckad-practice-progress';

export function loadAllPracticeProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function loadModuleProgress(moduleId) {
  return loadAllPracticeProgress()[moduleId] || {};
}

export function saveModuleProgress(moduleId, questionProgress) {
  try {
    const all = loadAllPracticeProgress();
    all[moduleId] = questionProgress;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

export function updateQuestionProgress(moduleId, questionNumber, result, passThreshold = 66) {
  const module = { ...loadModuleProgress(moduleId) };
  if (!result || result.total === 0) {
    module[questionNumber] = module[questionNumber] || 'tried';
  } else if (result.scorePercent >= passThreshold) {
    module[questionNumber] = 'pass';
  } else {
    module[questionNumber] = 'fail';
  }
  saveModuleProgress(moduleId, module);
  return module;
}

export function getModuleStats(moduleId, totalQuestions) {
  const module = loadModuleProgress(moduleId);
  let passed = 0;
  let tried = 0;

  for (let n = 1; n <= totalQuestions; n++) {
    const status = module[n];
    if (status === 'pass') {
      passed += 1;
      tried += 1;
    } else if (status === 'fail' || status === 'tried') {
      tried += 1;
    }
  }

  return { passed, tried, total: totalQuestions };
}

export function renderProgressBar(stats) {
  if (!stats.total) return '';
  const passPct = Math.round((stats.passed / stats.total) * 100);
  const triedPct = Math.round((stats.tried / stats.total) * 100);

  return `
    <div class="exam-card-progress" aria-label="${stats.passed} of ${stats.total} questions passed">
      <div class="progress-track">
        <div class="progress-fill pass" style="width:${passPct}%"></div>
        <div class="progress-fill tried" style="width:${Math.max(0, triedPct - passPct)}%"></div>
      </div>
      <span class="progress-label">${stats.passed}/${stats.total} passed</span>
    </div>
  `;
}
