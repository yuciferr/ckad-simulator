export interface ExamQuestion {
  number: number;
  title: string;
  weight: number;
  context: string;
  body: string;
}

export interface ExamData {
  id: string;
  title: string;
  duration: number;
  passPercentage: number;
  group: 'mock' | 'practice';
  questions: ExamQuestion[];
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

export interface AnswerEntry {
  number: number;
  body: string;
  criteria: string[];
}

export interface PracticeCheck {
  label: string;
  pass: boolean | null;
  reason?: string;
  alternative?: boolean;
  isPathGroup?: boolean;
  isPathOr?: boolean;
  paths?: PracticeCheck[];
  subResults?: PracticeCheck[];
}

export interface PracticeScoreResult {
  checks: PracticeCheck[];
  alternativeChecks: PracticeCheck[];
  pathGroups: unknown[];
  scorePercent: number;
  passed: number;
  total: number;
}

export interface Evidence {
  commands: Record<string, string[]>;
  applied: Record<string, string>;
  files: Record<string, string>;
}

export interface SavedSession {
  examId: string;
  mode: 'exam' | 'practice';
  reviewMode: string;
  currentQuestion: number;
  currentScreen: string;
  flagged: number[];
  timerSeconds: number;
  reviewScores: Record<number, Record<number, boolean>>;
  practiceResults: Record<number, PracticeScoreResult>;
  savedAt: number;
}

export type PracticeProgressStatus = 'pass' | 'fail' | 'tried';

export interface AppState {
  currentScreen: string;
  exam: ExamData | null;
  answers: AnswerEntry[] | null;
  mode: 'exam' | 'practice';
  currentQuestion: number;
  flagged: Set<number>;
  timerSeconds: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  ws: WebSocket | null;
  terminals: Map<number, { terminal: InstanceType<typeof Terminal>; fitAddon: InstanceType<typeof FitAddon.FitAddon> }>;
  terminalWrappers: Map<number, HTMLElement>;
  reviewScores: Record<number, Record<number, boolean>>;
  evidence: Evidence | null;
  autoScored: Record<number, Record<number, { auto: boolean; confidence?: string; reason?: string }>>;
  practiceResults: Record<number, PracticeScoreResult>;
  reviewMode: string;
  onTimerExpired: (() => void) | null;
}

declare global {
  const marked: { parse: (src: string) => string };
  const Terminal: {
    new (options?: Record<string, unknown>): {
      write: (data: string) => void;
      open: (el: HTMLElement) => void;
      loadAddon: (addon: unknown) => void;
      onData: (cb: (data: string) => void) => void;
      onResize: (cb: (size: { cols: number; rows: number }) => void) => void;
      focus: () => void;
      dispose: () => void;
      cols: number;
      rows: number;
    };
  };
  namespace FitAddon {
    class FitAddon {
      fit(): void;
    }
  }
}

export {};
