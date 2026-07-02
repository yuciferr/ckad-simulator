import { execFile } from 'child_process';
import { promisify } from 'util';
import { KUBECONFIG_PATH } from '../config';

const execFileAsync = promisify(execFile);

export interface KubectlResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function splitArgs(args: string): string[] {
  return args.split(/\s+/).filter(Boolean);
}

export async function kubectl(
  args: string,
  options?: { namespace?: string; timeoutMs?: number }
): Promise<KubectlResult> {
  const argsArray = splitArgs(args);

  if (
    options?.namespace &&
    !args.includes('-n ') &&
    !args.includes('--namespace')
  ) {
    argsArray.push('-n', options.namespace);
  }

  try {
    const { stdout, stderr } = await execFileAsync('kubectl', argsArray, {
      env: { ...process.env, KUBECONFIG: KUBECONFIG_PATH },
      timeout: options?.timeoutMs ?? 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? 'kubectl failed',
      exitCode: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

export async function kubectlOrThrow(
  args: string,
  options?: { namespace?: string; timeoutMs?: number }
): Promise<string> {
  const result = await kubectl(args, options);
  if (result.exitCode !== 0) {
    throw new Error(`kubectl ${args} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export async function isClusterReady(): Promise<boolean> {
  const result = await kubectl('cluster-info', { timeoutMs: 5_000 });
  return result.exitCode === 0;
}
