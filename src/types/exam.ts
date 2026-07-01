export interface ExamQuestion {
  number: number;
  title: string;
  weight: number;
  context: string;
  body: string;
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

export interface AnswerEntry {
  number: number;
  body: string;
  criteria: string[];
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
