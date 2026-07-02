import fs from 'fs';
import path from 'path';
import { EXAMS_DIR, MOCK_SCENARIO_NAMESPACE_PREFIX } from '../config';
import { resolveExamPaths } from '../exam/registry';
import { kubectl, kubectlOrThrow } from './kubectl';

export type ExamGroup = 'mock' | 'practice';
export type ScenarioPhase = 'idle' | 'deleting' | 'applying' | 'waiting' | 'ready' | 'error';

export function getScenarioPath(
  examId: string,
  questionIndex: number,
  group: ExamGroup = 'mock'
): string {
  const segment = group === 'mock' ? 'mock' : 'practice';
  return path.join(
    EXAMS_DIR,
    segment,
    examId,
    'scenarios',
    `q${questionIndex + 1}`
  );
}

export function scenarioHasManifests(scenarioPath: string): boolean {
  if (!fs.existsSync(scenarioPath)) return false;
  return fs.readdirSync(scenarioPath).some((name) => /\.ya?ml$/i.test(name));
}

export function resolveExamGroup(examId: string): ExamGroup {
  const paths = resolveExamPaths(examId);
  return paths?.group === 'practice' ? 'practice' : 'mock';
}

export function questionNamespace(
  questionIndex: number,
  group: ExamGroup = 'mock',
  hasScenario = true
): string {
  if (group === 'practice') return 'default';
  return `${MOCK_SCENARIO_NAMESPACE_PREFIX}${questionIndex + 1}`;
}

export function initialNamespaceForQuestion(
  examId: string | null,
  questionIndex: number
): string {
  if (!examId) return 'default';
  const group = resolveExamGroup(examId);
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  return questionNamespace(questionIndex, group, scenarioHasManifests(scenarioPath));
}

export async function resetQuestionScenario(
  examId: string,
  questionIndex: number,
  group: ExamGroup = resolveExamGroup(examId),
  onProgress?: (phase: ScenarioPhase, message?: string) => void
): Promise<{ namespace: string; scenarioApplied: boolean }> {
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  const hasManifests = scenarioHasManifests(scenarioPath);
  const ns = questionNamespace(questionIndex, group, hasManifests);

  if (group === 'practice' && !hasManifests) {
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
    await kubectl(
      `wait --for=condition=Ready pods --all -n ${ns} --timeout=30s`,
      { timeoutMs: 35_000 }
    );
    onProgress?.('ready');
    return { namespace: ns, scenarioApplied: true };
  }

  onProgress?.('applying', `Creating namespace ${ns}…`);
  await kubectlOrThrow(`create namespace ${ns}`);
  onProgress?.('ready');
  return { namespace: ns, scenarioApplied: false };
}

export async function cleanupExamNamespaces(
  examId: string,
  questionCount: number,
  group: ExamGroup = resolveExamGroup(examId)
): Promise<void> {
  if (group === 'practice') {
    const tasks: Promise<unknown>[] = [];
    for (let index = 0; index < questionCount; index++) {
      const scenarioPath = getScenarioPath(examId, index, group);
      if (scenarioHasManifests(scenarioPath)) {
        tasks.push(
          kubectl(`delete -f ${scenarioPath}/ --ignore-not-found`, {
            timeoutMs: 60_000,
          })
        );
      }
    }
    if (tasks.length) await Promise.allSettled(tasks);
    return;
  }

  const tasks = Array.from({ length: questionCount }, (_, index) => {
    const ns = questionNamespace(index, group, true);
    return kubectl(`delete namespace ${ns} --ignore-not-found`, {
      timeoutMs: 60_000,
    });
  });
  await Promise.allSettled(tasks);
}

const loadedScenarioKeys = new Set<string>();
const scenarioPromises = new Map<string, Promise<void>>();

export function clearLoadedScenarioCache(): void {
  loadedScenarioKeys.clear();
  scenarioPromises.clear();
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
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  if (group === 'practice' && !scenarioHasManifests(scenarioPath)) {
    loadedScenarioKeys.add(key);
    onProgress?.('ready');
    return;
  }

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
