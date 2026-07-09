import fs from 'fs';
import path from 'path';
import { SANDBOX_DIR, SANDBOX_MODE } from '../config';
import { resolveExamPaths, loadExamFile } from '../exam/registry';
import { seedCourseFromExam } from './course';
import {
  clearLoadedScenarioCache,
  cleanupExamNamespaces,
  prewarmFirstQuestionScenario,
  resolveExamGroup,
} from './scenario';

const SESSION_FILE = path.join(SANDBOX_DIR, '.exam-session.json');

export const terminalInputBuffers = new Map<string, string>();

let currentExamId: string | null = null;

// Bumped on every resetSandboxState() call (i.e. every new/re-entered exam
// session) so cleanupCurrentExam()'s slow async teardown can detect whether
// it's still cleaning up the session that's actually current — reopening the
// *same* exam id produces the same currentExamId string, so a plain identity
// check on currentExamId can't tell "still this session" from "a new session
// that happens to have the same id" apart. See cleanupCurrentExam().
let sessionGeneration = 0;

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
  sessionGeneration++;
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
  seedCourseFromExam(examId);
  writeSessionFile(examId);
}

/** Delete every namespace an exam's questions could have used, ignoring in-flight claims. */
async function cleanupExamNamespacesFully(examId: string): Promise<void> {
  const paths = resolveExamPaths(examId);
  if (!paths) return;

  const exam = loadExamFile(paths);
  const questionCount = exam.questions?.length ?? 0;
  if (questionCount === 0) return;

  const group = resolveExamGroup(examId);
  await cleanupExamNamespaces(examId, questionCount, group, { skipClaimed: false });
}

/** Reset workspace and, in kind mode, delete mock-exam cluster namespaces. */
export async function resetSandboxStateAsync(
  examId: string | null = null
): Promise<{ mode: string; questionCount?: number; group?: string }> {
  const previousExamId = currentExamId;
  resetSandboxState(examId);

  // Safety net: if the previous session was left without an explicit
  // cleanupCurrentExam() call (tab closed, crash, switching straight to a
  // different exam), its namespaces would otherwise linger indefinitely.
  if (SANDBOX_MODE === 'kind' && previousExamId && previousExamId !== examId) {
    void cleanupExamNamespacesFully(previousExamId).catch((err) => {
      console.warn(
        `Background cleanup of previous exam ${previousExamId} failed:`,
        (err as Error).message
      );
    });
  }

  if (SANDBOX_MODE !== 'kind' || !examId) {
    return { mode: SANDBOX_MODE };
  }

  const paths = resolveExamPaths(String(examId));
  if (!paths) {
    return { mode: SANDBOX_MODE };
  }

  const exam = loadExamFile(paths);
  const questionCount = exam.questions?.length ?? 0;
  const group = resolveExamGroup(String(examId));

  if (questionCount > 0) {
    // Order matters: prewarm claims question 0's namespace synchronously
    // (before any await yields) so the background cleanup below skips it
    // and can't race a stale delete against the freshly-applied scenario.
    prewarmFirstQuestionScenario(String(examId));
    void cleanupExamNamespaces(String(examId), questionCount, group).catch((err) => {
      console.warn(`Background namespace cleanup failed for ${examId}:`, (err as Error).message);
    });
  }

  return { mode: SANDBOX_MODE, questionCount, group };
}

/**
 * Explicit cleanup for "the user left this exam" (back to home / closing out
 * of review), rather than waiting for the next resetSandboxStateAsync() call
 * to sweep it up. Deletes every namespace the current exam could have used,
 * including ones still marked "claimed" from an active session — there's no
 * in-flight work left to protect once the user is done.
 *
 * cleanupExamNamespacesFully() can take a long time for exams with many
 * heavy (manifest-backed) questions — e.g. mock exam 2's 20 questions vs.
 * exam 1's 17 — during which a *new* startExam() can legitimately run and
 * start a fresh session (possibly for the very same exam id, e.g. the user
 * re-opens exam 2 right away). Guard on sessionGeneration rather than
 * currentExamId: reopening the same exam produces the same id string, so an
 * identity check on currentExamId can't distinguish "still this session"
 * from "a new session that happens to share the id." Only clear state if no
 * resetSandboxState() has run since this cleanup started — otherwise this
 * stale cleanup would null out a session that's already active, making
 * every subsequent terminal spawn with INITIAL_NAMESPACE=default instead of
 * its real per-question namespace.
 */
export async function cleanupCurrentExam(): Promise<{ cleaned: boolean }> {
  const examId = currentExamId;
  const generation = sessionGeneration;
  if (SANDBOX_MODE !== 'kind' || !examId) return { cleaned: false };

  await cleanupExamNamespacesFully(examId);
  if (sessionGeneration === generation) {
    clearLoadedScenarioCache();
    currentExamId = null;
  }
  return { cleaned: true };
}

export { SANDBOX_DIR };
