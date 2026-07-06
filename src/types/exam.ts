export interface ExamQuestion {
  number: number;
  title: string;
  weight: number;
  context: string;
  body: string;
  /** Practice-only: resolved kubectl namespace for this question (see scripts/assign-practice-namespaces.js). */
  namespace?: string;
  /**
   * Practice-only: when false, the sandbox does NOT pre-create this question's
   * namespace — the student is expected to create it themselves (the graded
   * task is "create namespace X"). Defaults to true. See resetQuestionScenario.
   */
  createNamespace?: boolean;
}

export interface ExamFile {
  id?: string;
  title: string;
  duration: number;
  passPercentage: number;
  group?: 'mock' | 'practice';
  source?: string;
  questions: ExamQuestion[];
}

/**
 * A declarative grading check (see src/client/scoring/checks.ts for the full
 * shape + evaluator). Kept loose server-side — the server only passes it through
 * to the client, which owns evaluation.
 */
export interface AnswerCheck {
  label: string;
  weight?: number;
  [k: string]: unknown;
}

export interface AnswerEntry {
  number: number;
  body: string;
  criteria: string[];
  checks?: AnswerCheck[];
}

export interface AnswerFile {
  id?: string;
  answers: AnswerEntry[];
}

export interface ExamManifest {
  version?: number;
  mock: string[];
  practice: string[];
}

export interface ExamListItem {
  id: string;
  title: string;
  duration: number;
  passPercentage: number;
  hasAnswer: boolean;
  group: 'mock' | 'practice';
  questionCount: number;
}

export interface ExamPayload {
  id: string;
  title: string;
  duration: number;
  passPercentage: number;
  group: 'mock' | 'practice';
  questions: ExamQuestion[];
}

export interface ResolvedExamPaths {
  examPath: string;
  answerPath: string;
  group: 'mock' | 'practice';
}
