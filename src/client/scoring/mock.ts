import type { Evidence } from '../types.js';

interface AutoScoreResult {
  auto: boolean;
  confidence?: string;
  reason?: string;
}

type K8sItem = Record<string, unknown>;

function items(state: Evidence['clusterState'], qIdx: number, resource: string): K8sItem[] {
  const bucket = state?.[String(qIdx)]?.resources?.[resource];
  if (!bucket || !Array.isArray(bucket.items)) return [];
  return bucket.items as K8sItem[];
}

function deploymentByName(state: Evidence['clusterState'], qIdx: number, name: string): K8sItem | undefined {
  return items(state, qIdx, 'deployments').find((d) => (d.metadata as { name?: string })?.name === name);
}

function podReadyCount(state: Evidence['clusterState'], qIdx: number): number {
  return items(state, qIdx, 'pods').filter((p) => {
    const conditions = ((p.status as { conditions?: Array<{ type?: string; status?: string }> })?.conditions) || [];
    return conditions.some((c) => c.type === 'Ready' && c.status === 'True');
  }).length;
}

function scoreFromClusterState(
  criterion: string,
  qIdx: number,
  evidence: Evidence
): AutoScoreResult | null {
  const state = evidence.clusterState;
  if (!state?.[String(qIdx)]) return null;

  const cLow = criterion.toLowerCase();

  if (cLow.includes('pods running') || cLow.includes('applied and pods')) {
    const ready = podReadyCount(state, qIdx);
    if (ready > 0) {
      return { auto: true, confidence: 'high', reason: `Cluster: ${ready} pod(s) Ready` };
    }
  }

  const replicaMatch = cLow.match(/(\d+)\s*replicas?/);
  if (replicaMatch && cLow.includes('deployment')) {
    const want = parseInt(replicaMatch[1], 10);
    const nameMatch = criterion.match(/deployment\s+([a-z0-9-]+)/i);
    const depName = nameMatch?.[1];
    const deployments = items(state, qIdx, 'deployments');
    const dep = depName
      ? deploymentByName(state, qIdx, depName)
      : deployments.find((d) => ((d.spec as { replicas?: number })?.replicas ?? 0) >= want);
    const replicas = (dep?.spec as { replicas?: number })?.replicas;
    if (dep && replicas === want) {
      return { auto: true, confidence: 'high', reason: `Cluster: Deployment replicas=${want}` };
    }
  }

  if (cLow.includes('tcpsocket') && cLow.includes('80')) {
    for (const dep of items(state, qIdx, 'deployments')) {
      const containers = ((dep.spec as { template?: { spec?: { containers?: Array<Record<string, unknown>> } } })
        ?.template?.spec?.containers) || [];
      for (const c of containers) {
        const probe = c.livenessProbe as { tcpSocket?: { port?: number } } | undefined;
        if (probe?.tcpSocket?.port === 80) {
          return { auto: true, confidence: 'high', reason: 'Cluster: livenessProbe tcpSocket port 80' };
        }
      }
    }
  }

  if (cLow.includes('initialdelayseconds') && cLow.includes('10')) {
    for (const dep of items(state, qIdx, 'deployments')) {
      const containers = ((dep.spec as { template?: { spec?: { containers?: Array<Record<string, unknown>> } } })
        ?.template?.spec?.containers) || [];
      for (const c of containers) {
        const probe = c.livenessProbe as { initialDelaySeconds?: number } | undefined;
        if (probe?.initialDelaySeconds === 10) {
          return { auto: true, confidence: 'high', reason: 'Cluster: initialDelaySeconds=10' };
        }
      }
    }
  }

  if (cLow.includes('periodseconds') && cLow.includes('15')) {
    for (const dep of items(state, qIdx, 'deployments')) {
      const containers = ((dep.spec as { template?: { spec?: { containers?: Array<Record<string, unknown>> } } })
        ?.template?.spec?.containers) || [];
      for (const c of containers) {
        const probe = c.livenessProbe as { periodSeconds?: number } | undefined;
        if (probe?.periodSeconds === 15) {
          return { auto: true, confidence: 'high', reason: 'Cluster: periodSeconds=15' };
        }
      }
    }
  }

  if (cLow.includes('readinessprobe') && (cLow.includes('port to 80') || cLow.includes('port 80'))) {
    for (const dep of items(state, qIdx, 'deployments')) {
      const name = (dep.metadata as { name?: string })?.name || '';
      if (name.includes('earth-3cc-web')) {
        const containers = ((dep.spec as { template?: { spec?: { containers?: Array<Record<string, unknown>> } } })
          ?.template?.spec?.containers) || [];
        for (const c of containers) {
          const probe = c.readinessProbe as { tcpSocket?: { port?: number } } | undefined;
          if (probe?.tcpSocket?.port === 80) {
            return { auto: true, confidence: 'high', reason: 'Cluster: readinessProbe port 80' };
          }
        }
      }
    }
  }

  if (cLow.includes('serviceaccount') || cLow.includes('service account')) {
    const saMatch = criterion.match(/sa-[a-z0-9-]+|[a-z0-9-]+-deploy/i);
    const saName = saMatch?.[0];
    if (saName) {
      for (const dep of items(state, qIdx, 'deployments')) {
        const sa = (dep.spec as { template?: { spec?: { serviceAccountName?: string } } })
          ?.template?.spec?.serviceAccountName;
        if (sa === saName) {
          return { auto: true, confidence: 'high', reason: `Cluster: serviceAccountName=${saName}` };
        }
      }
    }
  }

  if (cLow.includes('clusterip service') || (cLow.includes('service') && cLow.includes('port'))) {
    const svcMatch = criterion.match(/service\s+([a-z0-9-]+)/i);
    const svcName = svcMatch?.[1];
    const portMatch = criterion.match(/port\s+(\d+)/i);
    const wantPort = portMatch ? parseInt(portMatch[1], 10) : null;
    for (const svc of items(state, qIdx, 'services')) {
      const name = (svc.metadata as { name?: string })?.name;
      if (svcName && name !== svcName) continue;
      const ports = (svc.spec as { ports?: Array<{ port?: number }> })?.ports || [];
      if (!wantPort || ports.some((p) => p.port === wantPort)) {
        return { auto: true, confidence: 'high', reason: `Cluster: Service ${name || 'found'}` };
      }
    }
  }

  if (cLow.includes('networkpolicy') || cLow.includes('netpol')) {
    const policies = items(state, qIdx, 'networkpolicies');
    if (policies.length > 0) {
      return { auto: true, confidence: 'high', reason: 'Cluster: NetworkPolicy exists' };
    }
  }

  if (cLow.includes('cronjob')) {
    const jobs = items(state, qIdx, 'cronjobs');
    if (jobs.length > 0) {
      return { auto: true, confidence: 'high', reason: 'Cluster: CronJob exists' };
    }
  }

  if (cLow.includes('configmap')) {
    if (items(state, qIdx, 'configmaps').length > 0) {
      return { auto: true, confidence: 'medium', reason: 'Cluster: ConfigMap exists' };
    }
  }

  if (cLow.includes('secret')) {
    if (items(state, qIdx, 'secrets').length > 0) {
      return { auto: true, confidence: 'medium', reason: 'Cluster: Secret exists' };
    }
  }

  if (cLow.includes('ingress')) {
    if (items(state, qIdx, 'ingresses').length > 0) {
      return { auto: true, confidence: 'high', reason: 'Cluster: Ingress exists' };
    }
  }

  if (cLow.includes('rolebinding') || cLow.includes('role binding')) {
    if (items(state, qIdx, 'rolebindings').length > 0) {
      return { auto: true, confidence: 'high', reason: 'Cluster: RoleBinding exists' };
    }
  }

  return null;
}

function scoreFromVerify(
  criterion: string,
  qIdx: number,
  evidence: Evidence
): AutoScoreResult | null {
  const verify = evidence.verify?.[String(qIdx)];
  if (!verify?.passed) return null;

  const cLow = criterion.toLowerCase();
  const outLow = verify.output.toLowerCase();

  if (cLow.includes('livenessprobe') || cLow.includes('tcpsocket')) {
    if (outLow.includes('liveness') || outLow.includes('tcpsocket') || outLow.includes('pass')) {
      return { auto: true, confidence: 'high', reason: `verify.sh: ${verify.output.split('\n')[0]}` };
    }
  }

  if (cLow.includes('readiness') && outLow.includes('readiness')) {
    return { auto: true, confidence: 'high', reason: `verify.sh: ${verify.output.split('\n')[0]}` };
  }

  if (cLow.includes('crashloop') || cLow.includes('running')) {
    if (outLow.includes('pass')) {
      return { auto: true, confidence: 'high', reason: `verify.sh: ${verify.output.split('\n')[0]}` };
    }
  }

  if (cLow.includes('rbac') || cLow.includes('role')) {
    if (outLow.includes('pass')) {
      return { auto: true, confidence: 'high', reason: `verify.sh: ${verify.output.split('\n')[0]}` };
    }
  }

  return null;
}

export function autoScoreAll(state: import('../types.js').AppState): void {
  if (!state.evidence || !state.exam || !state.answers) return;

  for (const q of state.exam.questions) {
    const a = state.answers.find((ans) => ans.number === q.number);
    if (!a || a.criteria.length === 0) continue;

    const qIdx = state.exam.questions.indexOf(q);
    state.autoScored[q.number] = {};

    a.criteria.forEach((criterion, i) => {
      const result = scoreOneCriterion(criterion, qIdx, q.number, state.evidence!);
      state.autoScored[q.number][i] = result;
      if (result.auto && !(state.reviewScores[q.number] && state.reviewScores[q.number][i] !== undefined)) {
        if (!state.reviewScores[q.number]) state.reviewScores[q.number] = {};
        state.reviewScores[q.number][i] = true;
      }
    });
  }
}

export function scoreOneCriterion(
  criterion: string,
  qIdx: number,
  qNumber: number,
  evidence: Evidence
): AutoScoreResult {
  const verifyScore = scoreFromVerify(criterion, qIdx, evidence);
  if (verifyScore) return verifyScore;

  const clusterScore = scoreFromClusterState(criterion, qIdx, evidence);
  if (clusterScore) return clusterScore;

  const cLow = criterion.toLowerCase();

  const qCmds = (evidence.commands[String(qIdx)] || []).join('\n').toLowerCase();
  const allCmds = Object.values(evidence.commands).flat().join('\n').toLowerCase();
  const appliedText = Object.values(evidence.applied || {}).join('\n').toLowerCase();

  const pPrefix = `opt/course/p${qNumber}/`;
  const qFileText = Object.entries(evidence.files || {})
    .filter(([k]) => k.startsWith(pPrefix))
    .map(([, v]) => v)
    .join('\n')
    .toLowerCase();

  const allFileText = Object.values(evidence.files || {}).join('\n').toLowerCase();

  const mainEvidence = [qCmds, appliedText, qFileText].join('\n');
  const broadEvidence = [mainEvidence, allCmds, appliedText, allFileText].join('\n');

  const pathsInCriterion = criterion.match(/\/opt\/[^\s,)']+|\/tmp\/[^\s,)']+/g) || [];
  for (const p of pathsInCriterion) {
    const rel = p.replace(/^\/opt\/course\//, 'opt/course/').replace(/^\/opt\//, 'opt/');
    if (evidence.files && evidence.files[rel]) {
      return { auto: true, confidence: 'high', reason: `File found: ${p}` };
    }
    const base = p.split('/').pop();
    if (base && evidence.files && Object.keys(evidence.files).some((k) => k.endsWith(base))) {
      return { auto: true, confidence: 'high', reason: `File found: ${base}` };
    }
  }

  const camelWords = criterion.match(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g) || [];
  const numbers = criterion.match(/\b\d+\b/g) || [];

  if (camelWords.length > 0) {
    const foundCamel = camelWords.filter((w) => broadEvidence.includes(w.toLowerCase()));
    const foundNums = numbers.filter((n) => {
      for (const w of foundCamel) {
        const idx = broadEvidence.indexOf(w.toLowerCase());
        if (idx !== -1 && broadEvidence.slice(idx, idx + 60).includes(n)) return true;
      }
      return broadEvidence.includes(n);
    });

    if (foundCamel.length === camelWords.length) {
      if (numbers.length === 0 || foundNums.length === numbers.length) {
        return {
          auto: true, confidence: 'high',
          reason: `Found in files/history: ${foundCamel.join(', ')}${foundNums.length ? ` = ${foundNums.join(', ')}` : ''}`,
        };
      }
      return {
        auto: true, confidence: 'medium',
        reason: `Field found but values not confirmed: ${foundCamel.join(', ')}`,
      };
    }
    if (foundCamel.length > 0) {
      return { auto: true, confidence: 'low', reason: `Partial field match: ${foundCamel.join(', ')}` };
    }
  }

  const verbMap: Record<string, string[]> = {
    apply: ['k apply', 'kubectl apply'],
    applied: ['k apply', 'kubectl apply'],
    create: ['k create', 'kubectl create', 'k run', 'kubectl run'],
    created: ['k create', 'kubectl create', 'k run', 'kubectl run'],
    delete: ['k delete', 'kubectl delete'],
    scale: ['k scale', 'kubectl scale'],
    expose: ['k expose', 'kubectl expose'],
    install: ['helm install'],
    upgrade: ['helm upgrade'],
    label: ['k label', 'kubectl label'],
    annotate: ['k annotate', 'kubectl annotate'],
    edit: ['k edit', 'kubectl edit', 'vim'],
  };

  for (const [verb, patterns] of Object.entries(verbMap)) {
    if (!cLow.includes(verb)) continue;
    const matched = patterns.find((p) => qCmds.includes(p) || allCmds.includes(p));
    if (matched) {
      return { auto: true, confidence: 'medium', reason: `Command found: ${matched}` };
    }
  }

  const quotedVals = [...(criterion.match(/"([^"]+)"/g) || []), ...(criterion.match(/`([^`]+)`/g) || [])]
    .map((v) => v.replace(/["`]/g, '').toLowerCase());

  if (quotedVals.length > 0) {
    const found = quotedVals.filter((v) => broadEvidence.includes(v));
    if (found.length === quotedVals.length) {
      return { auto: true, confidence: 'medium', reason: `Values found: ${found.join(', ')}` };
    }
  }

  const k8sKinds = ['deployment', 'pod', 'service', 'configmap', 'secret', 'ingress',
    'networkpolicy', 'persistentvolumeclaim', 'serviceaccount', 'role',
    'rolebinding', 'clusterrole', 'clusterrolebinding', 'cronjob', 'job',
    'daemonset', 'statefulset', 'replicaset'];

  const mentionedKinds = k8sKinds.filter((k) => cLow.includes(k));
  const hasKubectl = qCmds.includes('kubectl') || qCmds.includes(' k ') || qCmds.startsWith('k ');
  if (mentionedKinds.length > 0 && hasKubectl) {
    const kindInCmds = mentionedKinds.some((k) => qCmds.includes(k));
    if (kindInCmds) {
      return { auto: true, confidence: 'low', reason: `kubectl + ${mentionedKinds[0]} found in history` };
    }
  }

  return { auto: false };
}
