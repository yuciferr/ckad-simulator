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

  it('requires --show-labels when expected', () => {
    const without = commandMatches('k get po --show-labels', 'kubectl get po\n');
    expect(without.pass).toBe(false);
    expect(without.reason).toMatch(/show-labels/i);

    const withFlag = commandMatches('k get po --show-labels', 'kubectl get po --show-labels\n');
    expect(withFlag.pass).toBe(true);
  });

  it('requires selector flag and value', () => {
    const wrong = commandMatches('k get po -l app=v2', 'kubectl get po\n');
    expect(wrong.pass).toBe(false);

    const ok = commandMatches('k get po -l app=v2', 'kubectl get po -l app=v2\n');
    expect(ok.pass).toBe(true);
  });

  it('requires -L label column flag', () => {
    const wrong = commandMatches('k get po -L app', 'kubectl get po\n');
    expect(wrong.pass).toBe(false);

    const ok = commandMatches('k get po -L app', 'kubectl get po -L app\n');
    expect(ok.pass).toBe(true);
  });

  it('rejects partial kubectl match via loose fallback', () => {
    const result = commandMatches('k delete pod nginx1', 'kubectl get pods\n');
    expect(result.pass).toBe(false);
  });
});
