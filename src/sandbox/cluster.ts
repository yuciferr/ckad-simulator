import { KUBECONFIG_PATH } from '../config';
import { isClusterReady, kubectl } from './kubectl';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForCluster(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isClusterReady()) return;
    await sleep(2000);
  }

  throw new Error(`Kind cluster not ready after ${timeoutMs / 1000}s`);
}

export async function getClusterStatus(): Promise<{
  ready: boolean;
  nodes?: string[];
  version?: string;
}> {
  const ready = await isClusterReady();
  if (!ready) return { ready: false };

  const nodesResult = await kubectl('get nodes -o name');
  const versionResult = await kubectl('version --client=true');

  const nodes =
    nodesResult.exitCode === 0
      ? nodesResult.stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => line.replace('node/', ''))
      : undefined;

  return {
    ready: true,
    nodes,
    version: versionResult.exitCode === 0 ? versionResult.stdout.trim() : undefined,
  };
}

export function getKubeconfigPath(): string {
  return KUBECONFIG_PATH;
}
