import { describe, expect, it } from 'vitest';
import {
  evaluateChecks,
  scoreFromChecks,
  commandAssertionMatches,
  tokenInHistory,
} from '../src/client/scoring/checks';
import type { Check } from '../src/client/scoring/checks';
import type { Evidence } from '../src/client/types';

function evidenceWith(
  resources: Record<string, { items: unknown[] }>,
  commands: string[] = [],
  files: Record<string, string> = {}
): Evidence {
  return {
    commands: { '0': commands },
    applied: {},
    files,
    clusterState: { '0': { namespace: 'ns', resources } },
  };
}

describe('tokenInHistory', () => {
  it('accepts resource alias po for pods', () => {
    expect(tokenInHistory('pods', 'kubectl get po -n default'.toLowerCase())).toBe(true);
  });
  it('rejects an absent token', () => {
    expect(tokenInHistory('busybox2', 'kubectl get pods'.toLowerCase())).toBe(false);
  });
});

describe('commandAssertionMatches', () => {
  it('matches a kubectl verb tolerant of k/kubectl', () => {
    expect(commandAssertionMatches({ verb: 'exec' }, 'k exec -it busybox -c c2 -- sh')).toBe(true);
  });
  it('accepts create when history used apply', () => {
    expect(commandAssertionMatches({ verb: 'create' }, 'kubectl apply -f pod.yaml')).toBe(true);
  });
  it('requires all contains tokens', () => {
    expect(commandAssertionMatches({ contains: ['helm install', 'bitnami/node'] }, 'helm install r bitnami/node')).toBe(true);
    expect(commandAssertionMatches({ verb: 'delete', contains: ['--force'] }, 'k delete pod x')).toBe(false);
  });
});

describe('evaluateChecks — resource assertions', () => {
  it('passes for a 2-container pod regardless of container names', () => {
    const checks: Check[] = [
      { label: '2 containers', resource: 'pods', name: 'busybox', path: 'spec.containers[*]', count: 2 },
      { label: 'busybox image', resource: 'pods', name: 'busybox', path: 'spec.containers[*].image', contains: 'busybox' },
      { label: 'emptyDir', resource: 'pods', name: 'busybox', has: 'spec.volumes[*].emptyDir' },
      { label: 'mounted /etc/foo', resource: 'pods', name: 'busybox', path: 'spec.containers[*].volumeMounts[*].mountPath', contains: '/etc/foo' },
    ];
    const pod = {
      metadata: { name: 'busybox' },
      spec: {
        containers: [
          { name: 'c1', image: 'busybox', volumeMounts: [{ mountPath: '/etc/foo' }] },
          { name: 'c2', image: 'busybox', volumeMounts: [{ mountPath: '/etc/foo' }] },
        ],
        volumes: [{ name: 'shared', emptyDir: {} }],
      },
    };
    const res = evaluateChecks(checks, 0, evidenceWith({ pods: { items: [pod] } }));
    expect(res.every((r) => r.pass)).toBe(true);
    expect(scoreFromChecks(res).scorePercent).toBe(100);
  });

  it('falls back to authored YAML when the resource was deleted', () => {
    const checks: Check[] = [
      { label: '2 containers', resource: 'pods', name: 'busybox', path: 'spec.containers[*]', count: 2 },
      { label: 'emptyDir', resource: 'pods', name: 'busybox', has: 'spec.volumes[*].emptyDir' },
    ];
    const yaml =
      'kind: Pod\nmetadata:\n  name: busybox\nspec:\n  containers:\n  - {name: c1}\n  - {name: c2}\n  volumes:\n  - emptyDir: {}\n';
    const res = evaluateChecks(checks, 0, evidenceWith({ pods: { items: [] } }, [], { 'home/pod.yaml': yaml }));
    expect(res.every((r) => r.pass)).toBe(true);
  });

  it('resolves numeric equals and nested cronjob templates', () => {
    const checks: Check[] = [
      { label: 'replicas', resource: 'deployments', name: 'sunny', path: 'spec.replicas', equals: 4 },
      { label: 'cj deadline', resource: 'cronjobs', path: 'spec.jobTemplate.spec.activeDeadlineSeconds', equals: 17 },
    ];
    const res = evaluateChecks(checks, 0, evidenceWith({
      deployments: { items: [{ metadata: { name: 'sunny' }, spec: { replicas: 4 } }] },
      cronjobs: { items: [{ metadata: { name: 'cj' }, spec: { jobTemplate: { spec: { activeDeadlineSeconds: 17 } } } }] },
    }));
    expect(res.every((r) => r.pass)).toBe(true);
  });

  it('fails on the wrong value', () => {
    const res = evaluateChecks(
      [{ label: 'replicas', resource: 'deployments', name: 'foo', path: 'spec.replicas', equals: 3 }],
      0,
      evidenceWith({ deployments: { items: [{ metadata: { name: 'foo' }, spec: { replicas: 1 } }] } })
    );
    expect(res[0].pass).toBe(false);
  });

  it('supports boolean equals and gte', () => {
    const res = evaluateChecks(
      [
        { label: 'readonly', resource: 'pods', name: 'p', path: 'spec.containers[*].securityContext.readOnlyRootFilesystem', equals: true },
        { label: 'ready', resource: 'deployments', name: 'd', path: 'status.readyReplicas', gte: 3 },
      ],
      0,
      evidenceWith({
        pods: { items: [{ metadata: { name: 'p' }, spec: { containers: [{ securityContext: { readOnlyRootFilesystem: true } }] } }] },
        deployments: { items: [{ metadata: { name: 'd' }, status: { readyReplicas: 3 } }] },
      })
    );
    expect(res.every((r) => r.pass)).toBe(true);
  });
});

describe('scoreFromChecks', () => {
  it('weights checks and ignores null (manual) checks', () => {
    const { scorePercent, passed, total } = scoreFromChecks([
      { label: 'a', pass: true, reason: '', weight: 1 },
      { label: 'b', pass: false, reason: '', weight: 1 },
      { label: 'c', pass: null, reason: '', weight: 1 },
    ]);
    expect(total).toBe(2);
    expect(passed).toBe(1);
    expect(scorePercent).toBe(50);
  });
});
