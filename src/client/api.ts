import type { ExamListItem, ExamData, AnswerEntry, Evidence } from './types.js';

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

export async function fetchEvidence(): Promise<Evidence | null> {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch('/api/session/evidence');
    if (res.ok) return res.json();
  } catch { /* ignore */ }
  return null;
}
