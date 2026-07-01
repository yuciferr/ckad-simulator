import fs from 'fs';
import path from 'path';
import { EXAMS_DIR, EXAMS_DIR_RESOLVED } from '../config';
import type {
  AnswerFile,
  ExamFile,
  ExamListItem,
  ExamManifest,
  ExamPayload,
  ResolvedExamPaths,
  AnswerEntry,
} from '../types/exam';

const MANIFEST_PATH = path.join(EXAMS_DIR, 'manifest.json');
const MOCK_DIR = path.join(EXAMS_DIR, 'mock');
const PRACTICE_DIR = path.join(EXAMS_DIR, 'practice');

export function loadManifest(): ExamManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { mock: [], practice: [] };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as ExamManifest;
}

export function isSafeExamId(id: string): boolean {
  if (typeof id !== 'string' || !id) return false;
  if (/^\d+$/.test(id)) return true;
  return /^[a-z0-9_-]+$/.test(id);
}

function isPathWithinExamsDir(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved === EXAMS_DIR_RESOLVED || resolved.startsWith(`${EXAMS_DIR_RESOLVED}${path.sep}`);
}

export function resolveExamPaths(id: string): ResolvedExamPaths | null {
  if (!isSafeExamId(String(id))) return null;

  const mockExam = path.join(MOCK_DIR, id, 'exam.json');
  const mockAnswer = path.join(MOCK_DIR, id, 'answer.json');
  if (fs.existsSync(mockExam) && isPathWithinExamsDir(mockExam)) {
    return { examPath: mockExam, answerPath: mockAnswer, group: 'mock' };
  }

  const practiceExam = path.join(PRACTICE_DIR, id, 'exam.json');
  const practiceAnswer = path.join(PRACTICE_DIR, id, 'answer.json');
  if (fs.existsSync(practiceExam) && isPathWithinExamsDir(practiceExam)) {
    return { examPath: practiceExam, answerPath: practiceAnswer, group: 'practice' };
  }

  return null;
}

export function loadExamFile(paths: ResolvedExamPaths): ExamFile {
  return JSON.parse(fs.readFileSync(paths.examPath, 'utf-8')) as ExamFile;
}

export function loadAnswerFile(paths: ResolvedExamPaths): AnswerFile | null {
  if (!fs.existsSync(paths.answerPath)) return null;
  return JSON.parse(fs.readFileSync(paths.answerPath, 'utf-8')) as AnswerFile;
}

export function discoverExams(): ExamListItem[] {
  const manifest = loadManifest();
  const exams: ExamListItem[] = [];

  for (const id of manifest.mock || []) {
    const paths = resolveExamPaths(id);
    if (!paths) continue;
    const exam = loadExamFile(paths);
    exams.push({
      id,
      title: exam.title || `Exam ${id}`,
      duration: exam.duration || 120,
      passPercentage: exam.passPercentage || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'mock',
      questionCount: (exam.questions || []).length,
    });
  }

  for (const slug of manifest.practice || []) {
    const paths = resolveExamPaths(slug);
    if (!paths) continue;
    const exam = loadExamFile(paths);
    exams.push({
      id: slug,
      title: exam.title || slug,
      duration: exam.duration || 120,
      passPercentage: exam.passPercentage || 66,
      hasAnswer: fs.existsSync(paths.answerPath),
      group: 'practice',
      questionCount: (exam.questions || []).length,
    });
  }

  return exams;
}

export function examSortKey(exam: ExamListItem): string {
  if (exam.group === 'mock') return `0-${String(exam.id).padStart(4, '0')}`;
  const manifest = loadManifest();
  const idx = (manifest.practice || []).indexOf(exam.id);
  return `1-${String(idx === -1 ? 999 : idx).padStart(4, '0')}-${exam.id}`;
}

export function getExamPayload(id: string): ExamPayload | null {
  const paths = resolveExamPaths(id);
  if (!paths) return null;

  const exam = loadExamFile(paths);
  return {
    id,
    title: exam.title || `Exam ${id}`,
    duration: exam.duration || 120,
    passPercentage: exam.passPercentage || 66,
    group: paths.group,
    questions: exam.questions || [],
  };
}

export function getAnswersPayload(id: string): AnswerEntry[] | null {
  const paths = resolveExamPaths(id);
  if (!paths || !fs.existsSync(paths.answerPath)) return null;

  const data = loadAnswerFile(paths);
  if (!data) return null;
  return data.answers || (data as unknown as AnswerEntry[]);
}
