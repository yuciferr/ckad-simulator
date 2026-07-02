import { describe, expect, it } from 'vitest';
import { commandMatches, normalizeCmdLine } from '../src/client/scoring/practice';

describe('normalizeCmdLine', () => {
  it('normalizes kubectl to k alias', () => {
    expect(normalizeCmdLine('kubectl get pods')).toBe('k get pods');
  });

  it('strips -it and --rm flags', () => {
    expect(normalizeCmdLine('kubectl run x --rm -it --image=nginx')).toBe('k run x --image=nginx');
  });
});

describe('commandMatches', () => {
  it('matches kubectl get pods in history', () => {
    const result = commandMatches('k get pods', 'kubectl get pods\n');
    expect(result.pass).toBe(true);
  });

  it('accepts resource alias po for pods', () => {
    const result = commandMatches('k get po', 'kubectl get pods -n default');
    expect(result.pass).toBe(true);
  });

  it('accepts apply -f as equivalent to create -f', () => {
    const result = commandMatches(
      'k create -f deploy.yaml',
      'kubectl apply -f deploy.yaml'
    );
    expect(result.pass).toBe(true);
  });

  it('fails when required token missing', () => {
    const result = commandMatches('k delete pod broken', 'kubectl get pods');
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/Missing/i);
  });

  it('matches namespace flag', () => {
    const result = commandMatches(
      'k get pods -n earth',
      'kubectl get pods --namespace earth'
    );
    expect(result.pass).toBe(true);
  });
});
