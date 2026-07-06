import { evaluateChecks } from './checks.js';
/**
 * Mock auto-scoring now runs on the same declarative engine as practice
 * (scoring/checks.ts). It evaluates each question's `checks` against the
 * collected evidence and pre-checks the matching review-screen boxes; the
 * reviewer can still manually override. Final weighting-by-question-weight lives
 * in screens/review.ts (updateScore).
 */
export function autoScoreAll(state) {
    if (!state.evidence || !state.exam || !state.answers)
        return;
    for (const q of state.exam.questions) {
        const a = state.answers.find((ans) => ans.number === q.number);
        if (!a || !a.checks || a.checks.length === 0)
            continue;
        const qIdx = state.exam.questions.indexOf(q);
        const results = evaluateChecks(a.checks, qIdx, state.evidence);
        state.autoScored[q.number] = {};
        results.forEach((r, i) => {
            const auto = r.pass === true;
            state.autoScored[q.number][i] = { auto, confidence: 'high', reason: r.reason };
            if (auto &&
                !(state.reviewScores[q.number] && state.reviewScores[q.number][i] !== undefined)) {
                if (!state.reviewScores[q.number])
                    state.reviewScores[q.number] = {};
                state.reviewScores[q.number][i] = true;
            }
        });
    }
}
