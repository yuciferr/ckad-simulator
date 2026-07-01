import { execSync } from 'child_process';

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
}
