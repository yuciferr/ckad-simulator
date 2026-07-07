const PROGRESS_KEY = 'ckad-practice-progress';
const DETAIL_KEY = 'ckad-practice-detail';
export function loadAllPracticeProgress() {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        return raw ? JSON.parse(raw) : {};
    }
    catch {
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
    }
    catch { /* quota */ }
}
export function updateQuestionProgress(moduleId, questionNumber, result, passThreshold = 66) {
    const module = { ...loadModuleProgress(moduleId) };
    if (!result || result.total === 0) {
        module[questionNumber] = module[questionNumber] || 'tried';
    }
    else if (result.scorePercent >= passThreshold) {
        module[questionNumber] = 'pass';
    }
    else {
        module[questionNumber] = 'fail';
    }
    saveModuleProgress(moduleId, module);
    return module;
}
function loadAllDetail() {
    try {
        const raw = localStorage.getItem(DETAIL_KEY);
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
export function loadPracticeDetail(moduleId) {
    return loadAllDetail()[moduleId] || { lastQuestion: 0, results: {}, updatedAt: 0 };
}
/** Persist the module's graded results + where the student left off. */
export function savePracticeSnapshot(moduleId, lastQuestion, results) {
    try {
        const all = loadAllDetail();
        all[moduleId] = { lastQuestion, results: results || {}, updatedAt: Date.now() };
        localStorage.setItem(DETAIL_KEY, JSON.stringify(all));
    }
    catch { /* quota */ }
}
/**
 * Reconstruct a minimal graded result from a stored pass/fail/tried status, so
 * questions solved *before* the detailed store existed still re-open as solved
 * (with their reference solution). Detailed results are preferred when present.
 */
export function resultFromStatus(status) {
    if (status === 'pass') {
        return {
            checks: [{ label: 'Passed', pass: true, reason: 'Restored from your saved progress' }],
            alternativeChecks: [], pathGroups: [], scorePercent: 100, passed: 1, total: 1,
        };
    }
    if (status === 'fail') {
        return {
            checks: [{ label: 'Not fully passed', pass: false, reason: 'Restored from your saved progress — re-check to grade again' }],
            alternativeChecks: [], pathGroups: [], scorePercent: 0, passed: 0, total: 1,
        };
    }
    return {
        checks: [{ label: 'Attempted', pass: null, reason: 'Restored from your saved progress' }],
        alternativeChecks: [], pathGroups: [], scorePercent: 0, passed: 0, total: 0,
    };
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
        }
        else if (status === 'fail' || status === 'tried') {
            tried += 1;
        }
    }
    return { passed, tried, total: totalQuestions };
}
export function renderProgressBar(stats) {
    if (!stats.total)
        return '';
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
