import fs from 'fs';
import path from 'path';
import { SANDBOX_DIR, SANDBOX_MODE } from '../config';
import { resolveExamPaths, loadExamFile } from '../exam/registry';
import { clearLoadedScenarioCache, cleanupExamNamespaces } from './scenario';

const SESSION_FILE = path.join(SANDBOX_DIR, '.exam-session.json');

export const terminalInputBuffers = new Map<string, string>();

let currentExamId: string | null = null;

export function getCurrentExamId(): string | null {
  return currentExamId;
}

function ensureSandboxDir(): void {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

function unlinkIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function resetSandboxWorkFiles(): void {
  if (!fs.existsSync(SANDBOX_DIR)) return;

  const workExts = new Set(['.yaml', '.yml', '.sh', '.json', '.txt', '.conf', '.md']);
  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    const full = path.join(SANDBOX_DIR, f);
    if (!fs.statSync(full).isFile()) continue;
    if (workExts.has(path.extname(f))) fs.unlinkSync(full);
  }
}

function writeSessionFile(examId: string | null): void {
  if (!examId) {
    unlinkIfExists(SESSION_FILE);
    return;
  }

  const paths = resolveExamPaths(String(examId));
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify(
      {
        examId: String(examId),
        group: paths?.group ?? 'unknown',
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function clearTerminalInputBuffers(): void {
  terminalInputBuffers.clear();
}

/** Clear runtime workspace files and session metadata. */
export function resetSandboxState(examId: string | null = null): void {
  currentExamId = examId;
  clearLoadedScenarioCache();
  ensureSandboxDir();

  if (fs.existsSync(SANDBOX_DIR)) {
    for (const f of fs.readdirSync(SANDBOX_DIR)) {
      if (/^\.bash_history(_q\d+)?$/.test(f)) {
        unlinkIfExists(path.join(SANDBOX_DIR, f));
      }
    }
  }

  unlinkIfExists(path.join(SANDBOX_DIR, '.viminfo'));
  resetSandboxWorkFiles();
  clearTerminalInputBuffers();
  writeSessionFile(examId);
}

/** Reset workspace and, in kind mode, delete mock-exam cluster namespaces. */
export async function resetSandboxStateAsync(
  examId: string | null = null
): Promise<{ mode: string; questionCount?: number }> {
  resetSandboxState(examId);

  if (SANDBOX_MODE !== 'kind' || !examId) {
    return { mode: SANDBOX_MODE };
  }

  const paths = resolveExamPaths(String(examId));
  if (!paths || paths.group !== 'mock') {
    return { mode: SANDBOX_MODE };
  }

  const exam = loadExamFile(paths);
  const questionCount = exam.questions?.length ?? 0;
  if (questionCount > 0) {
    await cleanupExamNamespaces(questionCount);
  }

  return { mode: SANDBOX_MODE, questionCount };
}

export { SANDBOX_DIR };
