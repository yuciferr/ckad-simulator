import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { KUBECONFIG_PATH } from '../config';
import {
  getScenarioPath,
  initialNamespaceForQuestion,
  resolveExamGroup,
} from './scenario';

const execFileAsync = promisify(execFile);

export interface VerifyResult {
  passed: boolean;
  output: string;
}

export async function runScenarioVerify(
  examId: string,
  questionIndex: number
): Promise<VerifyResult | null> {
  const group = resolveExamGroup(examId);
  const scenarioPath = getScenarioPath(examId, questionIndex, group);
  const verifyScript = path.join(scenarioPath, 'verify.sh');

  if (!fs.existsSync(verifyScript)) return null;

  const ns = initialNamespaceForQuestion(examId, questionIndex);

  try {
    const { stdout, stderr } = await execFileAsync('bash', [verifyScript, ns], {
      env: { ...process.env, KUBECONFIG: KUBECONFIG_PATH },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    return { passed: true, output: output || 'PASS' };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
    return { passed: false, output: output || 'FAIL' };
  }
}

export async function runScenarioVerifyBatch(
  examId: string,
  questionIndices: number[]
): Promise<Record<string, VerifyResult>> {
  const results: Record<string, VerifyResult> = {};

  await Promise.all(
    questionIndices.map(async (index) => {
      const verify = await runScenarioVerify(examId, index);
      if (verify) results[String(index)] = verify;
    })
  );

  return results;
}
