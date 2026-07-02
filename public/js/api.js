export async function fetchExams() {
    const res = await fetch('/api/exams');
    if (!res.ok)
        throw new Error('Failed to load exams');
    return res.json();
}
export async function fetchExam(examId) {
    const res = await fetch(`/api/exams/${examId}`);
    if (!res.ok)
        throw new Error('Exam not found');
    return res.json();
}
export async function fetchAnswers(examId) {
    const res = await fetch(`/api/exams/${examId}/answers`);
    if (!res.ok)
        return null;
    return res.json();
}
export async function resetSandbox(examId) {
    const res = await fetch('/api/sandbox/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
    });
    if (!res.ok)
        throw new Error('Sandbox reset failed');
    return res.json();
}
export async function fetchHealth() {
    const res = await fetch('/health');
    return res.json();
}
export async function waitForClusterReady(timeoutMs = 120000, intervalMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const health = await fetchHealth();
            if (health.status === 'ok' && (health.cluster?.ready ?? true)) {
                return health;
            }
        }
        catch {
            /* retry */
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Kubernetes cluster is not ready. Run: make up');
}
export async function fetchEvidence(questionIndices) {
    await new Promise((r) => setTimeout(r, 300));
    let qs = '';
    if (typeof questionIndices === 'number') {
        qs = `?questions=${questionIndices}`;
    }
    else if (Array.isArray(questionIndices) && questionIndices.length) {
        qs = `?questions=${questionIndices.join(',')}`;
    }
    try {
        const res = await fetch(`/api/session/evidence${qs}`);
        if (res.ok)
            return res.json();
    }
    catch {
        /* ignore */
    }
    return null;
}
