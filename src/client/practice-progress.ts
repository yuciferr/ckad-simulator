import type { PracticeProgressStatus, PracticeScoreResult } from './types.js';

const PROGRESS_KEY = 'ckad-practice-progress';
const DETAIL_KEY = 'ckad-practice-detail';

type ModuleProgress = Record<number, PracticeProgressStatus>;
type AllProgress = Record<string, ModuleProgress>;

export function loadAllPracticeProgress(): AllProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function loadModuleProgress(moduleId: string): ModuleProgress {
  return loadAllPracticeProgress()[moduleId] || {};
}

export function saveModuleProgress(moduleId: string, questionProgress: ModuleProgress): void {
  try {
    const all = loadAllPracticeProgress();
    all[moduleId] = questionProgress;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

export function updateQuestionProgress(
  moduleId: string,
  questionNumber: number,
  result: PracticeScoreResult,
  passThreshold = 66
): ModuleProgress {
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

/* ------------------------------------------------------------------ *
 * Per-module resume detail (issue: solved questions should re-open as
 * solved, at the question the student left off). The status store above
 * powers the landing progress bars; this richer store keeps the actual
 * check results + last-visited question so re-entering a practice restores
 * the graded feedback without needing the (ephemeral, reset-on-entry)
 * terminal history.
 * ------------------------------------------------------------------ */

interface ModuleDetail {
  /** 0-based index of the question the student was last on. */
  lastQuestion: number;
  /** Graded result per question number (1-based key). */
  results: Record<number, PracticeScoreResult>;
  updatedAt: number;
}

type AllDetail = Record<string, ModuleDetail>;

function loadAllDetail(): AllDetail {
  try {
    const raw = localStorage.getItem(DETAIL_KEY);
    return raw ? (JSON.parse(raw) as AllDetail) : {};
  } catch {
    return {};
  }
}

export function loadPracticeDetail(moduleId: string): ModuleDetail {
  return loadAllDetail()[moduleId] || { lastQuestion: 0, results: {}, updatedAt: 0 };
}

/** Persist the module's graded results + where the student left off. */
export function savePracticeSnapshot(
  moduleId: string,
  lastQuestion: number,
  results: Record<number, PracticeScoreResult>
): void {
  try {
    const all = loadAllDetail();
    all[moduleId] = { lastQuestion, results: results || {}, updatedAt: Date.now() };
    localStorage.setItem(DETAIL_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

/**
 * Reconstruct a minimal graded result from a stored pass/fail/tried status, so
 * questions solved *before* the detailed store existed still re-open as solved
 * (with their reference solution). Detailed results are preferred when present.
 */
export function resultFromStatus(status: PracticeProgressStatus): PracticeScoreResult {
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

export interface ModuleStats {
  passed: number;
  tried: number;
  total: number;
}

export function getModuleStats(moduleId: string, totalQuestions: number): ModuleStats {
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

export function renderProgressBar(stats: ModuleStats): string {
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
