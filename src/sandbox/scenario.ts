import fs from 'fs';
import path from 'path';
import {
  EXAMS_DIR,
  MOCK_SCENARIO_NAMESPACE_PREFIX,
  PRACTICE_NAMESPACE_GROUP_SIZE,
} from '../config';
import { resolveExamPaths, loadExamFile } from '../exam/registry';
import { kubectl, kubectlOrThrow } from './kubectl';

export type ExamGroup = 'mock' | 'practice';
export type ScenarioPhase = 'idle' | 'deleting' | 'applying' | 'waiting' | 'ready' | 'error';

export function getScenarioPath(
  examId: string,
  questionIndex: number,
  group: ExamGroup = 'mock'
): string {
  const segment = group === 'mock' ? 'mock' : 'practice';
  return path.join(EXAMS_DIR, segment, examId, 'scenarios', `q${questionIndex + 1}`);
}

export function scenarioHasManifests(scenarioPath: string): boolean {
  if (!fs.existsSync(scenarioPath)) return false;
  return fs.readdirSync(scenarioPath).some((name) => /\.ya?ml$/i.test(name));
}

export function resolveExamGroup(examId: string): ExamGroup {
  const paths = resolveExamPaths(examId);
  return paths?.group === 'practice' ? 'practice' : 'mock';
}

/**
 * k8s namespace names must be RFC 1123 labels (lowercase alphanumeric + `-`,
 * no underscores) — several exam ids (e.g. `core_concepts`) aren't, so
 * sanitize before using one as a namespace segment. Mirrored verbatim in
 * scripts/assign-practice-namespaces.js — keep the two in sync.
 */
function sanitizeNamespaceSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Fallback when a practice question has no persisted `namespace` field (shouldn't normally happen). */
function fallbackPracticeNamespace(examId: string, questionNumber: number): string {
  const bucket = Math.ceil(questionNumber / PRACTICE_NAMESPACE_GROUP_SIZE);
  return `practice-${sanitizeNamespaceSegment(examId)}-g${bucket}`;
}

/**
 * Practice questions without their own scenario YAML get a namespace derived
 * from exam.json's per-question `namespace` field (see
 * scripts/assign-practice-namespaces.js) — either an explicit name the
 * question text already instructs the student to create, or a group bucket
 * shared by nearby question numbers so multi-step chains stay isolated
 * together without every question colliding in a single shared namespace.
 */
function practiceQuestionNamespace(examId: string, questionIndex: number): string {
  const paths = resolveExamPaths(examId);
  if (paths) {
    const exam = loadExamFile(paths);
    const q = exam.questions?.[questionIndex];
    if (q?.namespace) return q.namespace;
    if (q?.number) return fallbackPracticeNamespace(examId, q.number);
  }
  return fallbackPracticeNamespace(examId, questionIndex + 1);
}

/**
 * Whether the sandbox should pre-create this practice question's namespace.
 * Defaults to true; a question whose graded task is to create the namespace
 * itself sets `createNamespace: false` in exam.json so the student creates it
 * (see resetQuestionScenario and scripts/assign-practice-namespaces.js).
 */
function practiceQuestionCreatesNamespace(examId: string, questionIndex: number): boolean {
  const paths = resolveExamPaths(examId);
  if (paths) {
    const exam = loadExamFile(paths);
    const q = exam.questions?.[questionIndex];
    if (q?.createNamespace === false) return false;
  }
  return true;
}

export function questionNamespace(
  examId: string,
  questionIndex: number,
  group: ExamGroup = 'mock',
  hasScenario = true
): string {
  if (group === 'practice') {
    return hasScenario ? 'default' : practiceQuestionNamespace(examId, questionIndex);
  }
  return `${MOCK_SCENARIO_NAMESPACE_PREFIX}${questionIndex + 1}`;
}

export function initialNamespaceForQuestion(examId: string | null, questionIndex: number): string {
  if (!examId) return 'default';
  const group = resolveExamGroup(examId);
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  return questionNamespace(examId, questionIndex, group, scenarioHasManifests(scenarioPath));
}

export async function resetQuestionScenario(
  examId: string,
  questionIndex: number,
  group: ExamGroup = resolveExamGroup(examId),
  onProgress?: (phase: ScenarioPhase, message?: string) => void
): Promise<{ namespace: string; scenarioApplied: boolean }> {
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  const hasManifests = scenarioHasManifests(scenarioPath);
  const ns = questionNamespace(examId, questionIndex, group, hasManifests);

  if (group === 'practice' && !hasManifests) {
    if (!initializedNamespaces.has(ns)) {
      // First visit to this group namespace this session — clean slate.
      // Later questions sharing the same group ns must NOT hit this path,
      // since multi-step chains rely on earlier questions' resources surviving.
      onProgress?.('deleting', `Resetting namespace ${ns}…`);
      await kubectl(`delete namespace ${ns} --ignore-not-found --wait=true`, {
        timeoutMs: 60_000,
      });
      // A "create namespace X" question must start with X absent so the student
      // actually creates it — pre-creating it would satisfy the task for them.
      // We still mark it initialized so later questions in the same segment
      // reuse the student-created namespace instead of re-deleting it.
      if (practiceQuestionCreatesNamespace(examId, questionIndex)) {
        onProgress?.('applying', `Creating namespace ${ns}…`);
        await kubectlOrThrow(`create namespace ${ns}`);
      }
      initializedNamespaces.add(ns);
    }
    onProgress?.('ready');
    return { namespace: ns, scenarioApplied: false };
  }

  if (group === 'practice' && hasManifests) {
    onProgress?.('deleting', 'Resetting scenario resources…');
    await kubectl(`delete -f ${scenarioPath}/ --ignore-not-found --wait=true`, {
      timeoutMs: 120_000,
    });
    onProgress?.('applying', 'Applying scenario manifests…');
    await kubectlOrThrow(`apply -f ${scenarioPath}/`, { timeoutMs: 60_000 });
    onProgress?.('waiting', 'Waiting for pods…');
    await kubectl(`wait --for=condition=Ready pods --all --all-namespaces --timeout=30s`, {
      timeoutMs: 35_000,
    }).catch(() => {
      /* some practice pods are intentionally not Ready */
    });
    onProgress?.('ready');
    return { namespace: 'default', scenarioApplied: true };
  }

  onProgress?.('deleting', `Resetting namespace ${ns}…`);
  await kubectl(`delete namespace ${ns} --ignore-not-found --wait=true`, {
    timeoutMs: 60_000,
  });

  if (hasManifests) {
    onProgress?.('applying', 'Applying scenario manifests…');
    await kubectlOrThrow(`apply -f ${scenarioPath}/`, { timeoutMs: 60_000 });
    onProgress?.('waiting', 'Waiting for pods to become Ready…');
    await kubectl(`wait --for=condition=Ready pods --all -n ${ns} --timeout=30s`, {
      timeoutMs: 35_000,
    });
    onProgress?.('ready');
    return { namespace: ns, scenarioApplied: true };
  }

  onProgress?.('applying', `Creating namespace ${ns}…`);
  await kubectlOrThrow(`create namespace ${ns}`);
  onProgress?.('ready');
  return { namespace: ns, scenarioApplied: false };
}

/**
 * A question is "claimed" when ensureQuestionScenario already owns its full
 * lifecycle (cache hit or in-flight apply). Bulk cleanup must skip these —
 * otherwise a background delete could land after a freshly-applied scenario
 * and wipe it out (see resetSandboxStateAsync ordering in sandbox/reset.ts).
 */
function isNamespaceClaimed(examId: string, questionIndex: number): boolean {
  const key = `${examId}:${questionIndex}`;
  return loadedScenarioKeys.has(key) || scenarioPromises.has(key);
}

export async function cleanupExamNamespaces(
  examId: string,
  questionCount: number,
  group: ExamGroup = resolveExamGroup(examId),
  options: { skipClaimed?: boolean } = {}
): Promise<void> {
  // skipClaimed protects an in-flight/just-applied scenario during the
  // reset-into-a-session flow (see resetSandboxStateAsync). When cleaning up
  // *because the user is leaving the exam* (cleanupCurrentExam), every
  // namespace should be deleted regardless of claim state — nothing is
  // "in flight" anymore, and leaving claimed namespaces behind is exactly
  // the stale-namespace bug this option exists to avoid on exit.
  const { skipClaimed = true } = options;

  if (group === 'practice') {
    const tasks: Promise<unknown>[] = [];
    const groupNamespaces = new Set<string>();

    for (let index = 0; index < questionCount; index++) {
      if (skipClaimed && isNamespaceClaimed(examId, index)) continue;

      const scenarioPath = getScenarioPath(examId, index, group);
      if (scenarioHasManifests(scenarioPath)) {
        tasks.push(
          kubectl(`delete -f ${scenarioPath}/ --ignore-not-found`, {
            timeoutMs: 60_000,
          })
        );
        continue;
      }

      groupNamespaces.add(questionNamespace(examId, index, group, false));
    }

    for (const ns of groupNamespaces) {
      if (ns === 'default') continue;
      tasks.push(kubectl(`delete namespace ${ns} --ignore-not-found`, { timeoutMs: 60_000 }));
    }

    if (tasks.length) await Promise.allSettled(tasks);
    return;
  }

  const tasks: Promise<unknown>[] = [];
  for (let index = 0; index < questionCount; index++) {
    if (skipClaimed && isNamespaceClaimed(examId, index)) continue;
    const ns = questionNamespace(examId, index, group, true);
    tasks.push(kubectl(`delete namespace ${ns} --ignore-not-found`, { timeoutMs: 60_000 }));
  }
  await Promise.allSettled(tasks);
}

const loadedScenarioKeys = new Set<string>();
const scenarioPromises = new Map<string, Promise<void>>();
/** Practice group namespaces already reset-and-created this exam session. */
const initializedNamespaces = new Set<string>();

export function clearLoadedScenarioCache(): void {
  loadedScenarioKeys.clear();
  scenarioPromises.clear();
  initializedNamespaces.clear();
}

export function isScenarioReady(examId: string, questionIndex: number): boolean {
  return loadedScenarioKeys.has(`${examId}:${questionIndex}`);
}

export async function ensureQuestionScenario(
  examId: string,
  questionIndex: number,
  onProgress?: (phase: ScenarioPhase, message?: string) => void
): Promise<void> {
  const key = `${examId}:${questionIndex}`;
  if (loadedScenarioKeys.has(key)) {
    onProgress?.('ready');
    return;
  }

  const inflight = scenarioPromises.get(key);
  if (inflight) {
    await inflight;
    onProgress?.('ready');
    return;
  }

  const group = resolveExamGroup(examId);

  const promise = (async () => {
    try {
      await resetQuestionScenario(examId, questionIndex, group, onProgress);
      loadedScenarioKeys.add(key);
    } catch (err) {
      onProgress?.('error', (err as Error).message);
      throw err;
    } finally {
      scenarioPromises.delete(key);
    }
  })();

  scenarioPromises.set(key, promise);
  await promise;
}

/** Fire-and-forget pre-warm for the first question after exam reset. */
export function prewarmFirstQuestionScenario(examId: string): void {
  void ensureQuestionScenario(examId, 0).catch((err) => {
    console.warn(`Scenario pre-warm failed for ${examId}:`, (err as Error).message);
  });
}
