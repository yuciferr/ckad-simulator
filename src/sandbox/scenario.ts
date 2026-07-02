import fs from 'fs';
import path from 'path';
import { EXAMS_DIR, MOCK_SCENARIO_NAMESPACE_PREFIX } from '../config';
import { kubectl, kubectlOrThrow } from './kubectl';

export function questionNamespace(questionIndex: number): string {
  return `${MOCK_SCENARIO_NAMESPACE_PREFIX}${questionIndex + 1}`;
}

export function getScenarioPath(examId: string, questionIndex: number): string {
  return path.join(
    EXAMS_DIR,
    'mock',
    examId,
    'scenarios',
    `q${questionIndex + 1}`
  );
}

export function scenarioHasManifests(scenarioPath: string): boolean {
  if (!fs.existsSync(scenarioPath)) return false;
  return fs.readdirSync(scenarioPath).some((name) => /\.ya?ml$/i.test(name));
}

export async function resetQuestionScenario(
  examId: string,
  questionIndex: number
): Promise<{ namespace: string; scenarioApplied: boolean }> {
  const ns = questionNamespace(questionIndex);
  const scenarioPath = getScenarioPath(examId, questionIndex);

  await kubectl(`delete namespace ${ns} --ignore-not-found --wait=true`, {
    timeoutMs: 60_000,
  });

  if (scenarioHasManifests(scenarioPath)) {
    await kubectlOrThrow(`apply -f ${scenarioPath}/`, { timeoutMs: 60_000 });
    await kubectl(
      `wait --for=condition=Ready pods --all -n ${ns} --timeout=30s`,
      { timeoutMs: 35_000 }
    );
    return { namespace: ns, scenarioApplied: true };
  }

  await kubectlOrThrow(`create namespace ${ns}`);
  return { namespace: ns, scenarioApplied: false };
}

export async function cleanupExamNamespaces(questionCount: number): Promise<void> {
  const tasks = Array.from({ length: questionCount }, (_, index) =>
    kubectl(`delete namespace ${questionNamespace(index)} --ignore-not-found`, {
      timeoutMs: 60_000,
    })
  );
  await Promise.allSettled(tasks);
}

const loadedScenarioKeys = new Set<string>();

export function clearLoadedScenarioCache(): void {
  loadedScenarioKeys.clear();
}

export async function ensureQuestionScenario(
  examId: string,
  questionIndex: number
): Promise<void> {
  const key = `${examId}:${questionIndex}`;
  if (loadedScenarioKeys.has(key)) return;

  await resetQuestionScenario(examId, questionIndex);
  loadedScenarioKeys.add(key);
}
