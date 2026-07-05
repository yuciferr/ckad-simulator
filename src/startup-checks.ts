import { execSync } from 'child_process';
import { SANDBOX_MODE } from './config';
import { isClusterReady } from './sandbox/kubectl';

export function runStartupChecks(): void {
  try {
    const bashVersion = execSync('bash --version', { encoding: 'utf-8' });
    const match = bashVersion.match(/version (\d+)/);
    if (match && parseInt(match[1], 10) < 4) {
      console.warn('WARNING: bash 4+ recommended. macOS users: brew install bash');
    }
  } catch {
    console.warn('WARNING: could not detect bash version');
  }

  console.log(`Sandbox mode: ${SANDBOX_MODE}`);

  if (SANDBOX_MODE === 'kind') {
    void checkKindPrerequisites();
  }
}

async function checkKindPrerequisites(): Promise<void> {
  try {
    execSync('kubectl version --client=true', { encoding: 'utf-8', stdio: 'pipe' });
    console.log('kubectl: available');
  } catch {
    console.warn('WARNING: kubectl not found — required for kind mode');
  }

  const ready = await isClusterReady();
  if (ready) {
    console.log('Kind cluster: connected');
  } else {
    console.warn(
      'Kind cluster: not reachable yet (normal during first docker compose startup)'
    );
  }
}
