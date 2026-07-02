import type { AppState, Evidence } from '../types.js';

interface AutoScoreResult {
  auto: boolean;
  confidence?: string;
  reason?: string;
}

export function autoScoreAll(state: AppState): void {
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
