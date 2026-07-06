import { $, escapeHtml, attachCopyHandlers } from '../utils.js';
import { updateScoreRing } from '../score-ring.js';
import { evaluateChecks, scoreFromChecks } from './checks.js';
/**
 * Practice grading: evaluate the question's declarative `checks` (see
 * scoring/checks.ts) against the collected evidence — live cluster state first,
 * with tolerant command/manifest fallbacks. No more matching the reference
 * solution's exact commands, so any correct solution path scores full marks.
 */
/**
 * Did the student's work land in this question's assigned namespace? Folded in
 * as one low-weight signal. Skipped for `default` — the catch-all for
 * scenario-backed questions where "resources exist in default" is meaningless.
 */
function scoreNamespaceCheck(qIdx, evidence) {
    const cs = evidence?.clusterState?.[String(qIdx)];
    if (!cs || cs.namespace === 'default')
        return null;
    const hasResources = Object.values(cs.resources || {}).some((r) => Array.isArray(r?.items) &&
        r.items.length > 0);
    return {
        label: `Work done in namespace \`${cs.namespace}\``,
        pass: hasResources,
        reason: hasResources
            ? `Resources found in namespace ${cs.namespace}`
            : `No resources in ${cs.namespace} — this question's terminal starts there by default`,
        weight: 0.5,
    };
}
function toPracticeCheck(r) {
    return { label: r.label, pass: r.pass, reason: r.reason };
}
export function scorePracticeQuestion(qIdx, answer, evidence) {
    const empty = {
        checks: [],
        alternativeChecks: [],
        pathGroups: [],
        scorePercent: 0,
        passed: 0,
        total: 0,
    };
    if (!answer)
        return empty;
    const namespaceCheck = scoreNamespaceCheck(qIdx, evidence);
    const results = evaluateChecks(answer.checks, qIdx, evidence);
    if (results.length === 0) {
        // No declarative checks authored — fall back to the namespace signal only.
        const checks = [];
        if (namespaceCheck) {
            checks.push(toPracticeCheck(namespaceCheck));
        }
        else {
            checks.push({
                label: 'Review solution manually',
                pass: null,
                reason: 'No auto-checks defined for this question',
            });
        }
        return {
            checks,
            alternativeChecks: [],
            pathGroups: [],
            scorePercent: namespaceCheck ? (namespaceCheck.pass ? 100 : 0) : 0,
            passed: namespaceCheck?.pass ? 1 : 0,
            total: namespaceCheck ? 1 : 0,
        };
    }
    const combined = namespaceCheck ? [...results, namespaceCheck] : results;
    const { scorePercent, passed, total } = scoreFromChecks(combined);
    return {
        checks: combined.map(toPracticeCheck),
        alternativeChecks: [],
        pathGroups: [],
        scorePercent,
        passed,
        total,
    };
}
export function renderCheckItem(check) {
    const icon = check.pass === true ? '✅' : check.pass === false ? '❌' : 'ℹ️';
    const cls = check.pass === true ? 'pass' : check.pass === false ? 'fail' : '';
    const reason = check.reason || '';
    return `
    <div class="practice-check-item ${cls}">
      <span class="practice-check-icon">${icon}</span>
      <div class="practice-check-label">
        <span class="practice-check-cmd">${escapeHtml(check.label)}</span>
        ${reason ? `<span class="practice-check-reason">${escapeHtml(reason)}</span>` : ''}
      </div>
    </div>`;
}
export function renderPracticeFeedback(result, answer) {
    const pill = $('#practiceScorePill');
    pill.classList.remove('pass', 'partial');
    const ringEl = document.getElementById('practiceScoreRing');
    if (ringEl)
        updateScoreRing(ringEl, result.total === 0 ? 0 : result.scorePercent);
    if (result.total === 0) {
        pill.textContent = '—';
    }
    else if (result.scorePercent === 100) {
        pill.textContent = `${result.scorePercent}%`;
        pill.classList.add('pass');
    }
    else if (result.scorePercent >= 50) {
        pill.textContent = `${result.scorePercent}% (${result.passed}/${result.total})`;
        pill.classList.add('partial');
    }
    else {
        pill.textContent = `${result.scorePercent}% (${result.passed}/${result.total})`;
    }
    $('#practiceChecks').innerHTML = result.checks.map((check) => renderCheckItem(check)).join('');
    let breakdown = document.getElementById('practiceScoreBreakdown');
    if (!breakdown) {
        breakdown = document.createElement('div');
        breakdown.id = 'practiceScoreBreakdown';
        breakdown.className = 'score-breakdown';
        $('#practiceChecks').before(breakdown);
    }
    if (result.total > 0) {
        breakdown.classList.remove('hidden');
        breakdown.innerHTML = `
      <div class="score-breakdown-label">${result.passed}/${result.total} steps passed</div>
      <div class="score-breakdown-track">
        <div class="score-breakdown-pass" style="width:${result.scorePercent}%"></div>
        <div class="score-breakdown-fail" style="width:${100 - result.scorePercent}%"></div>
      </div>`;
    }
    else {
        breakdown.classList.add('hidden');
        breakdown.innerHTML = '';
    }
    const altSection = $('#practiceAlternatives');
    if (altSection) {
        altSection.classList.add('hidden');
        altSection.innerHTML = '';
    }
    if (answer) {
        const solutionHtml = answer.body
            .replace(/\*\*Question:\*\*[^\n]*\n*/i, '')
            .replace(/\*\*Solution:\*\*\s*/i, '')
            .trim();
        $('#practiceSolution').innerHTML = marked.parse(solutionHtml);
        attachCopyHandlers($('#practiceSolution'));
    }
    else {
        $('#practiceSolution').innerHTML = '<p style="color:#999">No solution available.</p>';
    }
}
