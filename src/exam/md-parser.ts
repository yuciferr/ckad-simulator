import type { ExamQuestion, AnswerEntry } from '../types/exam';

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    meta[key] = val;
  }
  return meta;
}

export function parseQuestions(content: string): ExamQuestion[] {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Question \d+)/);
  const questions: ExamQuestion[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Question (\d+)\s*\|\s*(.+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const lines = trimmed.split('\n').slice(1);

    let weight = 0;
    let context = '';
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('weight:')) {
        weight = parseInt(line.replace('weight:', '').trim(), 10);
        bodyStart = i + 1;
      } else if (line.startsWith('context:')) {
        context = line.replace('context:', '').trim().replace(/`/g, '');
        bodyStart = i + 1;
      } else if (line !== '') {
        bodyStart = i;
        break;
      }
    }

    const questionBody = lines.slice(bodyStart).join('\n').trim();
    questions.push({ number, title, weight, context, body: questionBody });
  }

  return questions;
}

export function parseAnswers(content: string): AnswerEntry[] {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Answer \d+)/);
  const answers: AnswerEntry[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Answer (\d+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const answerBody = trimmed.split('\n').slice(1).join('\n').trim();

    const criteria: string[] = [];
    const criteriaPattern = /- \[ \] (.+)/g;
    let m: RegExpExecArray | null;
    while ((m = criteriaPattern.exec(answerBody)) !== null) {
      criteria.push(m[1]);
    }

    answers.push({ number, body: answerBody, criteria });
  }

  return answers;
}

export function examFromMarkdown(content: string, meta: Record<string, string> = {}): Omit<import('../types/exam').ExamFile, 'group'> {
  const frontmatter = parseFrontmatter(content);
  return {
    title: frontmatter.title || meta.title || 'Untitled Exam',
    duration: parseInt(frontmatter.duration, 10) || 120,
    passPercentage: parseInt(frontmatter.pass_percentage, 10) || 66,
    questions: parseQuestions(content),
  };
}

export function answersFromMarkdown(content: string): { answers: AnswerEntry[] } {
  return { answers: parseAnswers(content) };
}

export function extractNamespacesFromText(text: string): string[] {
  const namespaces = new Set<string>();
  const patterns = [
    /Namespace [`']([^'`]+)[`']/gi,
    /namespace [`']([^'`]+)[`']/gi,
    /in Namespace [`']([^'`]+)[`']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) namespaces.add(m[1]);
  }
  return [...namespaces];
}
