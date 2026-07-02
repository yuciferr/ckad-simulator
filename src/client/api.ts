import type { ExamListItem, ExamData, AnswerEntry, Evidence } from './types.js';

export interface HealthResponse {
  status: 'ok' | 'initializing' | 'error';
  mode?: string;
  cluster?: {
    ready?: boolean;
    nodes?: string[];
    version?: string;
  };
  exams?: number;
  uptime?: number;
}

export async function fetchExams(): Promise<ExamListItem[]> {
  const res = await fetch('/api/exams');
  if (!res.ok) throw new Error('Failed to load exams');
  return res.json();
}

export async function fetchExam(examId: string): Promise<ExamData> {
  const res = await fetch(`/api/exams/${examId}`);
  if (!res.ok) throw new Error('Exam not found');
  return res.json();
}

export async function fetchAnswers(examId: string): Promise<AnswerEntry[] | null> {
  const res = await fetch(`/api/exams/${examId}/answers`);
  if (!res.ok) return null;
  return res.json();
}

export async function resetSandbox(examId: string): Promise<unknown> {
  const res = await fetch('/api/sandbox/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId }),
  });
  if (!res.ok) throw new Error('Sandbox reset failed');
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/health');
  return res.json();
}

export async function waitForClusterReady(
  timeoutMs = 120_000,
  intervalMs = 2000
): Promise<HealthResponse> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const health = await fetchHealth();
      if (health.status === 'ok' && (health.cluster?.ready ?? true)) {
        return health;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error('Kubernetes cluster is not ready. Run: make up');
}

export async function fetchEvidence(
  questionIndices?: number | number[]
): Promise<Evidence | null> {
  await new Promise((r) => setTimeout(r, 300));
  let qs = '';
  if (typeof questionIndices === 'number') {
    qs = `?questions=${questionIndices}`;
  } else if (Array.isArray(questionIndices) && questionIndices.length) {
    qs = `?questions=${questionIndices.join(',')}`;
  }
  try {
    const res = await fetch(`/api/session/evidence${qs}`);
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return null;
}
