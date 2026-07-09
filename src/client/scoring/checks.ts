import type { Evidence } from '../types.js';

/**
 * Declarative, result-oriented grading engine shared by mock and practice.
 *
 * A question's `answer.json` carries a `checks: Check[]` array. Each check makes
 * ONE assertion — against live cluster state (the primary, result-oriented path),
 * the student's typed command history (tolerant fallback for process-only tasks),
 * or a file they wrote. Checks assert *requirements from the question* ("2
 * containers", "replicas=4", "volume at /etc/foo") — never solution-specific
 * choices like a container name or `/bin/sh` vs `sh` — so any correct solution
 * path passes. See scripts/validate-exams.js for the authoring contract.
 */

/** Semantic kubectl-command assertion — tolerant to k/kubectl, po/pods, etc. */
export interface CommandAssertion {
  verb?: string;
  resource?: string;
  /** Extra literal tokens that must appear in history (lowercased substring). */
  contains?: string[];
}

export interface Check {
  label: string;
  weight?: number;

  // --- resource / cluster-state assertion ---
  resource?: string; // plural bucket key, e.g. 'pods', 'deployments' (see CLUSTER_RESOURCES)
  name?: string; // optional metadata.name filter; omitted = any item of this kind
  path?: string; // dot path with [*]/[N], e.g. 'spec.containers[*].image'
  has?: string; // shorthand: this path must resolve to a non-empty value

  // operators (exactly one of these, or `has`)
  exists?: boolean;
  equals?: string | number;
  contains?: string;
  count?: number;
  gte?: number;

  // --- command-evidence assertion ---
  command?: CommandAssertion;

  // --- file assertion ---
  file?: string;
  fileContains?: string;
}

export interface CheckResult {
  label: string;
  pass: boolean | null;
  reason: string;
  weight: number;
}

/* ------------------------------------------------------------------ *
 * kubectl history matching (moved here so mock + practice both share it)
 * ------------------------------------------------------------------ */

type AliasMap = Record<string, string[]>;

/** kubectl resource / flag synonyms (long form → accepted short forms in history) */
export const K8S_TOKEN_ALIASES: AliasMap = {
  namespace: ['ns', 'namespace'],
  namespaces: ['ns', 'namespaces'],
  pod: ['po', 'pod', 'pods'],
  pods: ['po', 'pod', 'pods'],
  deployment: ['deploy', 'deployment', 'deployments'],
  deployments: ['deploy', 'deployment', 'deployments'],
  service: ['svc', 'service', 'services'],
  services: ['svc', 'service', 'services'],
  configmap: ['cm', 'configmap', 'configmaps'],
  secret: ['secret', 'secrets'],
  ingress: ['ing', 'ingress', 'ingresses'],
  persistentvolumeclaim: ['pvc', 'persistentvolumeclaim', 'persistentvolumeclaims'],
  persistentvolume: ['pv', 'persistentvolume', 'persistentvolumes'],
  node: ['no', 'node', 'nodes'],
  nodes: ['no', 'node', 'nodes'],
  cronjob: ['cj', 'cronjob', 'cronjobs'],
  cronjobs: ['cj', 'cronjob', 'cronjobs'],
  job: ['job', 'jobs'],
  jobs: ['job', 'jobs'],
  daemonset: ['ds', 'daemonset', 'daemonsets'],
  replicaset: ['rs', 'replicaset', 'replicasets'],
  statefulset: ['sts', 'statefulset', 'statefulsets'],
  networkpolicy: ['netpol', 'networkpolicy', 'networkpolicies'],
  serviceaccount: ['sa', 'serviceaccount', 'serviceaccounts'],
};

export function normalizeHistoryText(text: string): string {
  let h = text.toLowerCase().replace(/\bkubectl\b/g, 'k');
  // Expand CKAD-style shell vars: export do='--dry-run=client -o yaml'
  for (const varName of ['do', 'dr']) {
    const exp = h.match(new RegExp(`export\\s+${varName}=["']?([^"'\\n]+)["']?`));
    if (exp) {
      h = h.replace(new RegExp(`\\$${varName}\\b`, 'g'), exp[1].toLowerCase());
    }
  }
  return h;
}

/** Whether a token (or any of its aliases) appears as a standalone word in history. */
export function tokenInHistory(token: string, history: string): boolean {
  if (!token) return true;
  const t = token.toLowerCase();
  const forms = K8S_TOKEN_ALIASES[t] || [t];
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s;|&"'=(])${escaped}(?:$|[\\s;|&"'=/])`);
    if (re.test(history)) return true;
  }
  return false;
}

const VERB_ALIASES: Record<string, string[]> = {
  create: ['create', 'apply', 'run'],
  apply: ['apply', 'create'],
  run: ['run', 'create'],
  delete: ['delete'],
  get: ['get'],
  describe: ['describe'],
  exec: ['exec'],
  logs: ['logs'],
  cp: ['cp'],
  scale: ['scale'],
  expose: ['expose'],
  label: ['label'],
  annotate: ['annotate'],
  edit: ['edit'],
  set: ['set'],
  rollout: ['rollout'],
  patch: ['patch'],
  top: ['top'],
};

/** Tolerant match of a CommandAssertion against the question's history text. */
export function commandAssertionMatches(cmd: CommandAssertion, historyRaw: string): boolean {
  const h = normalizeHistoryText(historyRaw);

  if (cmd.verb) {
    const accepted = VERB_ALIASES[cmd.verb] || [cmd.verb];
    const verbRe = new RegExp(`(?:^|[\\s;|&(])k\\s+(?:[a-z-]+\\s+)*(?:${accepted.join('|')})\\b`, 'm');
    if (!verbRe.test(h)) return false;
  }
  if (cmd.resource && !tokenInHistory(cmd.resource, h)) return false;
  if (cmd.contains) {
    for (const tok of cmd.contains) {
      if (!h.includes(tok.toLowerCase())) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * path resolution over cluster-state JSON
 * ------------------------------------------------------------------ */

type Json = unknown;

/** Resolve a dot path (with [*] wildcard and [N] index) to a flat list of values. */
function resolvePath(root: Json, path: string): Json[] {
  if (!path) return root === undefined ? [] : [root];
  const segments = path.split('.');
  let current: Json[] = [root];

  for (const seg of segments) {
    const next: Json[] = [];
    const m = seg.match(/^([^[]*)((?:\[[^\]]*\])*)$/);
    const key = m ? m[1] : seg;
    const brackets = m ? m[2] : '';

    for (const node of current) {
      let vals: Json[] = [node];
      if (key) {
        const obj = node as Record<string, Json> | null;
        if (obj == null || typeof obj !== 'object') {
          vals = [];
        } else {
          vals = obj[key] === undefined ? [] : [obj[key]];
        }
      }
      // apply any [*] / [N] accessors
      const accessors = brackets.match(/\[[^\]]*\]/g) || [];
      for (const acc of accessors) {
        const inner = acc.slice(1, -1);
        const expanded: Json[] = [];
        for (const v of vals) {
          if (!Array.isArray(v)) continue;
          if (inner === '*') expanded.push(...v);
          else {
            const idx = parseInt(inner, 10);
            if (!Number.isNaN(idx) && idx < v.length) expanded.push(v[idx]);
          }
        }
        vals = expanded;
      }
      next.push(...vals);
    }
    current = next;
  }
  return current.filter((v) => v !== undefined && v !== null);
}

interface K8sItem {
  metadata?: { name?: string };
  [k: string]: Json;
}

function itemsFor(evidence: Evidence, qIdx: number, resource: string): K8sItem[] {
  const bucket = evidence.clusterState?.[String(qIdx)]?.resources?.[resource];
  const items = (bucket as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? (items as K8sItem[]) : [];
}

function matchByName(items: K8sItem[], name?: string): K8sItem[] {
  if (!name) return items;
  return items.filter((it) => it.metadata?.name === name);
}

/** The literal a resource check hopes to find, for the text fallback. */
function checkLiteral(check: Check): string | null {
  if (check.contains !== undefined) return String(check.contains);
  if (check.equals !== undefined) return String(check.equals);
  if (check.has) return check.has.split('.').pop()!.replace(/\[.*\]/g, '');
  if (check.path) return check.path.split('.').pop()!.replace(/\[.*\]/g, '');
  return null;
}

function evalResourceCheck(check: Check, qIdx: number, evidence: Evidence, fallbackText: string): CheckResult {
  const weight = check.weight ?? 1;
  const resource = check.resource!;
  const items = matchByName(itemsFor(evidence, qIdx, resource), check.name);

  const path = check.has || check.path;
  const values = path ? items.flatMap((it) => resolvePath(it, path)) : (items as Json[]);

  let pass = false;
  if (check.has) {
    pass = values.length > 0;
  } else if (check.count !== undefined) {
    pass = values.length === check.count;
  } else if (check.gte !== undefined) {
    const nums = values.map(Number).filter((n) => !Number.isNaN(n));
    pass = nums.some((n) => n >= check.gte!) || values.length >= check.gte;
  } else if (check.equals !== undefined) {
    const want = String(check.equals).toLowerCase();
    pass = values.some((v) => String(v).toLowerCase() === want);
  } else if (check.contains !== undefined) {
    const want = String(check.contains).toLowerCase();
    pass = values.some((v) => String(v).toLowerCase().includes(want));
  } else {
    // bare existence: `exists:true` (default) or `exists:false`
    const present = items.length > 0;
    pass = check.exists === false ? !present : present;
  }

  if (pass) {
    return { label: check.label, pass: true, reason: `Verified in cluster (${resource})`, weight };
  }

  // Fallback: the live resource may have been created then deleted before
  // "Check". Confirm the expected shape from the student's manifests/history.
  if (check.exists !== false) {
    const literal = checkLiteral(check);
    const nameHit = check.name ? fallbackText.includes(check.name.toLowerCase()) : true;
    const literalHit = literal ? fallbackText.includes(literal.toLowerCase()) : false;
    if ((literal && literalHit && nameHit) || (!literal && check.name && nameHit)) {
      return {
        label: check.label,
        pass: true,
        reason: 'Verified from your manifest / history',
        weight,
      };
    }
  }

  return { label: check.label, pass: false, reason: reasonForFail(check, resource), weight };
}

function reasonForFail(check: Check, resource: string): string {
  const who = check.name ? `${resource}/${check.name}` : resource;
  if (check.count !== undefined) return `Expected ${check.count} — not found in ${who}`;
  if (check.gte !== undefined) return `Expected at least ${check.gte} in ${who}`;
  if (check.equals !== undefined) return `Expected ${check.path} = ${check.equals} in ${who}`;
  if (check.contains !== undefined) return `Expected ${check.path} to contain "${check.contains}" in ${who}`;
  if (check.has) return `${check.has} not set on ${who}`;
  return check.exists === false ? `${who} still exists` : `${who} not found`;
}

/** Evaluate every check for one question. Pure; no DOM/side effects. */
export function evaluateChecks(
  checks: Check[] | undefined,
  qIdx: number,
  evidence: Evidence | null
): CheckResult[] {
  if (!checks || checks.length === 0) return [];
  const ev: Evidence = evidence || { commands: {}, applied: {}, files: {} };

  const qCmds = (ev.commands[String(qIdx)] || []).join('\n');
  // Course files live at opt/course/p<questionNumber>/... — scope the text
  // fallback to this question's own material (plus unscoped $HOME
  // manifests) so a literal from question 5's starter/authored file can't
  // vacuously satisfy question 3's check.
  const coursePrefix = `opt/course/p${qIdx + 1}/`;
  const fileText = Object.entries(ev.files || {})
    .filter(([key]) => !key.startsWith('opt/course/') || key.startsWith(coursePrefix))
    .map(([, v]) => v)
    .join('\n');
  const appliedText = Object.values(ev.applied || {}).join('\n');
  const fallbackText = [qCmds, fileText, appliedText].join('\n').toLowerCase();

  return checks.map((check) => {
    const weight = check.weight ?? 1;
    if (check.resource) {
      return evalResourceCheck(check, qIdx, ev, fallbackText);
    }
    if (check.command) {
      const pass = commandAssertionMatches(check.command, fallbackText);
      return {
        label: check.label,
        pass,
        reason: pass ? 'Command found in your history' : 'Expected command not found in history',
        weight,
      };
    }
    if (check.file) {
      const target = check.file.replace(/^\/opt\/course\//, 'opt/course/').replace(/^\//, '');
      const base = check.file.split('/').pop()!;
      const entry = Object.entries(ev.files || {}).find(
        ([k]) => k === target || k.endsWith('/' + base) || k.endsWith(base)
      );
      let pass = !!entry;
      if (pass && check.fileContains) {
        pass = (entry![1] || '').toLowerCase().includes(check.fileContains.toLowerCase());
      }
      return {
        label: check.label,
        pass,
        reason: pass ? `File found: ${check.file}` : `File missing or incomplete: ${check.file}`,
        weight,
      };
    }
    return { label: check.label, pass: null, reason: 'Unrecognized check', weight };
  });
}

/** Weighted score from check results. */
export function scoreFromChecks(results: CheckResult[]): {
  scorePercent: number;
  passed: number;
  total: number;
} {
  const gradable = results.filter((r) => r.pass !== null);
  const total = gradable.length;
  const passed = gradable.filter((r) => r.pass === true).length;
  const totalWeight = gradable.reduce((s, r) => s + r.weight, 0);
  const earnedWeight = gradable.filter((r) => r.pass === true).reduce((s, r) => s + r.weight, 0);
  const scorePercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  return { scorePercent, passed, total };
}
