import { $, escapeHtml } from '../utils.js';
import { updateScoreRing } from '../score-ring.js';
import type { AnswerEntry, Evidence, PracticeCheck, PracticeScoreResult } from '../types.js';

type AliasMap = Record<string, string[]>;
interface CmdCheck {
  label: string;
  normalized: string;
  alternative: boolean;
}
interface CommandPath {
  commands: string[];
}
interface MatchResult {
  pass: boolean;
  reason: string;
}

/** kubectl resource / flag synonyms (long form → accepted short forms in history) */
const K8S_TOKEN_ALIASES: AliasMap = {
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
  persistentvolumeclaim: ['pvc', 'persistentvolumeclaim'],
  node: ['no', 'node', 'nodes'],
  nodes: ['no', 'node', 'nodes'],
  cronjob: ['cj', 'cronjob', 'cronjobs'],
  daemonset: ['ds', 'daemonset', 'daemonsets'],
  replicaset: ['rs', 'replicaset', 'replicasets'],
  statefulset: ['sts', 'statefulset', 'statefulsets'],
  networkpolicy: ['netpol', 'networkpolicy', 'networkpolicies'],
  serviceaccount: ['sa', 'serviceaccount', 'serviceaccounts'],
};

const K8S_VERBS = [
  'create',
  'run',
  'get',
  'apply',
  'delete',
  'describe',
  'logs',
  'exec',
  'set',
  'label',
  'expose',
  'scale',
  'patch',
  'edit',
  'rollout',
];

function normalizeCmdLine(cmd: string): string {
  return cmd
    .replace(/^kubectl\b/i, 'k')
    .replace(/\s+/g, ' ')
    .replace(/\s*-it\b/g, '')
    .replace(/\s*--rm\b/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHistoryText(text: string): string {
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

function resolveResourceToken(t: string): string | null {
  if (K8S_TOKEN_ALIASES[t]) return t;
  for (const [canonical, aliases] of Object.entries(K8S_TOKEN_ALIASES)) {
    if (aliases.includes(t)) return canonical;
  }
  return null;
}

/** Check if a token (or any alias) appears in command history */
function tokenInHistory(token: string, history: string): boolean {
  if (!token || token === 'k') return true;

  const forms = K8S_TOKEN_ALIASES[token] || [token];
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match as standalone word or after -n / =
    const re = new RegExp(`(?:^|[\\s;|&"'=(])${escaped}(?:$|[\\s;|&"'=/])`);
    if (re.test(history)) return true;
  }
  return false;
}

/** Parse kubectl command into semantic parts for smarter matching */
interface KubectlIntent {
  verb: string | null;
  resource: string | null;
  names: string[];
  flags: {
    namespace?: string;
    filename?: string;
    selector?: string;
    labelColumns?: string;
    showLabels?: boolean;
    output?: string;
    watch?: boolean;
    allNamespaces?: boolean;
    overwrite?: boolean;
    replicas?: string;
    follow?: boolean;
    previous?: boolean;
    list?: boolean;
  };
}

function extractOutputFlag(tokens: string[]): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-oyaml' || t === '--output=yaml' || t === '-o=yaml') return 'yaml';
    if (t === '-ojson' || t === '--output=json' || t === '-o=json') return 'json';
    if (t === '-owide' || t === '--output=wide' || t === '-o=wide') return 'wide';
    if (t.startsWith('jsonpath=')) return t;
    if (t.startsWith('custom-columns=')) return t;
    if (tokens[i - 1] === '-o') {
      if (t === 'yaml' || t === 'json' || t === 'wide') return t;
      if (t.startsWith('jsonpath')) return t;
      if (t.startsWith('custom-columns')) return t;
    }
  }
  return undefined;
}

function parseKubectlIntent(normalized: string): KubectlIntent | null {
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens[0] !== 'k' && tokens[0] !== 'kubectl') return null;

  const intent: KubectlIntent = { verb: null, resource: null, names: [], flags: {} };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) {
      if ((t === '-n' || t === '--namespace') && tokens[i + 1]) {
        intent.flags.namespace = tokens[++i];
      } else if ((t === '-f' || t === '--filename') && tokens[i + 1]) {
        intent.flags.filename = tokens[++i];
      } else if (t.startsWith('-f=')) {
        intent.flags.filename = t.slice(3);
      } else if ((t === '-l' || t === '--selector') && tokens[i + 1]) {
        intent.flags.selector = tokens[++i].replace(/^['"]|['"]$/g, '');
      } else if (t.startsWith('-l=') || t.startsWith('--selector=')) {
        intent.flags.selector = t
          .split('=')
          .slice(1)
          .join('=')
          .replace(/^['"]|['"]$/g, '');
      } else if ((t === '-L' || t === '--label-columns') && tokens[i + 1]) {
        intent.flags.labelColumns = tokens[++i];
      } else if (t.startsWith('-L=') || t.startsWith('--label-columns=')) {
        intent.flags.labelColumns = t.split('=').slice(1).join('=');
      } else if (t === '--show-labels') {
        intent.flags.showLabels = true;
      } else if (t === '-w' || t === '--watch') {
        intent.flags.watch = true;
      } else if (t === '-A' || t === '--all-namespaces') {
        intent.flags.allNamespaces = true;
      } else if (t === '--overwrite') {
        intent.flags.overwrite = true;
      } else if (t === '-f' || t === '--follow') {
        intent.flags.follow = true;
      } else if (t === '-p' || t === '--previous') {
        intent.flags.previous = true;
      } else if (t === '--list') {
        intent.flags.list = true;
      } else if (t === '--replicas' && tokens[i + 1]) {
        intent.flags.replicas = tokens[++i];
      } else if (t.startsWith('--replicas=')) {
        intent.flags.replicas = t.slice('--replicas='.length);
      }
      continue;
    }
    if (!intent.verb && K8S_VERBS.includes(t)) {
      intent.verb = t;
      continue;
    }
    if (!intent.resource && resolveResourceToken(t)) {
      intent.resource = resolveResourceToken(t);
      continue;
    }
    if (t.length > 1 && !t.includes('=')) {
      intent.names.push(t.replace(/^['"]|['"]$/g, ''));
    }
  }

  intent.flags.output = extractOutputFlag(tokens);
  return intent;
}

function normalizeSelector(value: string): string {
  return value.replace(/['"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function selectorMatchesHistory(expected: string, history: string): boolean {
  const norm = normalizeSelector(expected);
  const h = history.toLowerCase();
  if (h.includes(norm)) return true;

  // Accept equivalent forms: app in (v2) vs app in(v2)
  const compact = norm.replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')');
  if (h.includes(compact)) return true;

  // For simple key=value selectors, require key=value substring
  if (norm.includes('=') && !norm.includes(' in ') && !norm.includes(' notin ')) {
    const parts = norm
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.every((part) => {
      if (part.includes('!=')) {
        const [key, val] = part.split('!=');
        return h.includes(key.trim()) && h.includes(val.trim());
      }
      return h.includes(part);
    });
  }
  return false;
}

function requiredFlagsPresent(intent: KubectlIntent, history: string): MatchResult {
  const h = history.toLowerCase();
  const f = intent.flags;

  if (f.showLabels && !h.includes('--show-labels')) {
    return { pass: false, reason: 'Missing flag: --show-labels' };
  }

  if (f.labelColumns) {
    const col = f.labelColumns.toLowerCase();
    const esc = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasCol =
      new RegExp(`-l\\s+${esc}(?!\\=)`).test(h) ||
      h.includes(`--label-columns=${col}`) ||
      h.includes(`--label-columns ${col}`);
    if (!hasCol) {
      return { pass: false, reason: `Missing label column flag: -L ${f.labelColumns}` };
    }
  }

  if (f.selector) {
    const hasSelFlag = /\s(-l|--selector)(=|\s)/.test(h);
    if (!hasSelFlag) {
      return { pass: false, reason: 'Missing selector flag: -l or --selector' };
    }
    if (!selectorMatchesHistory(f.selector, h)) {
      return { pass: false, reason: `Missing selector: ${f.selector}` };
    }
  }

  if (f.output) {
    const out = f.output.toLowerCase();
    if (out === 'yaml' && !/-o(\s|=)yaml|--output=yaml|-oyaml/.test(h)) {
      return { pass: false, reason: 'Missing output format: -o yaml' };
    }
    if (out === 'json' && !/-o(\s|=)json|--output=json|-ojson/.test(h)) {
      return { pass: false, reason: 'Missing output format: -o json' };
    }
    if (out === 'wide' && !/-o(\s|=)wide|--output=wide|-owide/.test(h)) {
      return { pass: false, reason: 'Missing output format: -o wide' };
    }
    if (out.startsWith('jsonpath') && !h.includes('jsonpath')) {
      return { pass: false, reason: 'Missing output format: jsonpath' };
    }
    if (out.startsWith('custom-columns') && !h.includes('custom-columns')) {
      return { pass: false, reason: 'Missing output format: custom-columns' };
    }
  }

  if (f.watch && !/\s(-w|--watch)\b/.test(h)) {
    return { pass: false, reason: 'Missing flag: --watch' };
  }

  if (f.allNamespaces && !/\s(-a|--all-namespaces)\b/.test(h)) {
    return { pass: false, reason: 'Missing flag: --all-namespaces' };
  }

  if (f.overwrite && !h.includes('--overwrite')) {
    return { pass: false, reason: 'Missing flag: --overwrite' };
  }

  if (f.follow && !/\s(-f|--follow)\b/.test(h)) {
    return { pass: false, reason: 'Missing flag: --follow' };
  }

  if (f.previous && !/\s(-p|--previous)\b/.test(h)) {
    return { pass: false, reason: 'Missing flag: --previous' };
  }

  if (f.list && !h.includes('--list')) {
    return { pass: false, reason: 'Missing flag: --list' };
  }

  if (
    f.replicas &&
    !h.includes(f.replicas) &&
    !h.includes(`--replicas=${f.replicas}`) &&
    !h.includes(`--replicas ${f.replicas}`)
  ) {
    return { pass: false, reason: `Missing replicas: ${f.replicas}` };
  }

  return { pass: true, reason: '' };
}

function verbMatchesInHistory(
  expectedVerb: string,
  history: string,
  intent: KubectlIntent
): MatchResult {
  const hasFileFlag =
    intent.flags.filename || intent.names.some((n) => /\.ya?ml$/.test(n)) || /\s-f\s/.test(history);

  let accepted = [expectedVerb];
  if ((expectedVerb === 'create' || expectedVerb === 'apply') && hasFileFlag) {
    accepted = ['create', 'apply'];
  }

  if (accepted.some((v) => tokenInHistory(v, history))) {
    if (
      expectedVerb === 'create' &&
      tokenInHistory('apply', history) &&
      !tokenInHistory('create', history)
    ) {
      return { pass: true, reason: 'apply -f accepted (equivalent to create -f)' };
    }
    return { pass: true, reason: 'Command found in terminal history' };
  }
  return {
    pass: false,
    reason: `Missing command: ${expectedVerb}${hasFileFlag ? ' or apply' : ''}`,
  };
}

function intentMatchesHistory(expectedNorm: string, history: string): MatchResult | null {
  const intent = parseKubectlIntent(expectedNorm);
  if (!intent || !intent.verb) {
    return null;
  }

  const h = normalizeHistoryText(history);

  const verbCheck = verbMatchesInHistory(intent.verb, h, intent);
  if (!verbCheck.pass) {
    return { pass: false, reason: verbCheck.reason };
  }

  const flagCheck = requiredFlagsPresent(intent, h);
  if (!flagCheck.pass) {
    return { pass: false, reason: flagCheck.reason };
  }

  // rollout / set subcommands must appear in history
  if (intent.verb === 'rollout' || intent.verb === 'set') {
    for (const name of intent.names) {
      if (!tokenInHistory(name, h)) {
        return { pass: false, reason: `Missing: ${name}` };
      }
    }
  } else {
    if (intent.resource && !tokenInHistory(intent.resource, h)) {
      const aliases = K8S_TOKEN_ALIASES[intent.resource] || [intent.resource];
      return { pass: false, reason: `Missing resource (try: ${aliases.join(' or ')})` };
    }

    for (const name of intent.names) {
      if (/\.ya?ml$/.test(name)) continue;
      if (!tokenInHistory(name, h)) {
        return { pass: false, reason: `Missing: ${name}` };
      }
    }
  }

  const ns = intent.flags.namespace;
  if (ns && !tokenInHistory(ns, h)) {
    return { pass: false, reason: `Missing namespace: ${ns}` };
  }

  const file = intent.flags.filename;
  if (file && !tokenInHistory(file.replace(/^\.\//, ''), h)) {
    return { pass: false, reason: `Missing file: ${file}` };
  }

  return {
    pass: true,
    reason: verbCheck.reason || 'Command found in terminal history (aliases accepted)',
  };
}

function commandMatches(normalized: string, historyRaw: string): MatchResult {
  const history = normalizeHistoryText(historyRaw);

  const intentResult = intentMatchesHistory(normalized, history);
  if (intentResult) return intentResult;

  // Avoid overly loose fallback when command clearly targets kubectl resources
  if (/^k\s+(get|delete|describe|logs|exec|scale|label|annotate|rollout|set)\b/.test(normalized)) {
    return { pass: false, reason: 'Command not found in terminal history' };
  }

  const skip = new Set(['the', 'and', 'or', 'with', 'using', 'from', 'into', 'k']);
  const tokens = normalized
    .split(' ')
    .filter((t) => t && !t.startsWith('-') && !t.includes('=') && t.length > 1 && !skip.has(t));

  if (tokens.length === 0) return { pass: false, reason: 'No command tokens to match' };

  const missing = tokens.filter((t) => !tokenInHistory(t, history));
  if (missing.length === 0) {
    return { pass: true, reason: 'Command pattern found in terminal history' };
  }

  const hints = missing.map((t) => {
    const aliases = K8S_TOKEN_ALIASES[t];
    return aliases ? `${t} (${aliases.join('/')})` : t;
  });
  return { pass: false, reason: `Missing in history: ${hints.join(', ')}` };
}

function isValidCommandLine(line: string): boolean {
  const cmd = line.split(/\s+#/)[0].trim();
  if (!cmd) return false;
  if (!/^(kubectl|k|helm)\b/i.test(cmd)) return false;
  if (/^(cat|echo|ls|head|tail|watch|vi|vim)\s/i.test(cmd)) return false;
  return true;
}

function stripInlineComment(line: string): string {
  return line.replace(/\s+#.*$/, '').trim();
}

/** Parse one bash block; split on full-line `# or` comments into alternative paths */
function parseBashBlockIntoPaths(blockContent: string): CommandPath[] {
  const paths: CommandPath[] = [{ commands: [] }];
  let current = 0;
  const OR_SPLIT = /^#\s*or\s*(?:$|,)/i;

  for (const rawLine of blockContent.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (OR_SPLIT.test(trimmed)) {
        paths.push({ commands: [] });
        current++;
      }
      continue;
    }

    const cmd = stripInlineComment(trimmed);
    if (!isValidCommandLine(cmd)) continue;
    paths[current].commands.push(cmd);
  }

  return paths.filter((p) => p.commands.length > 0);
}

function extractBashBlocks(
  answerBody: string
): Array<{ content: string; index: number; end: number }> {
  const blocks: Array<{ content: string; index: number; end: number }> = [];
  const re = /```bash\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(answerBody)) !== null) {
    blocks.push({ content: m[1], index: m.index, end: re.lastIndex });
  }
  return blocks;
}

function extractPracticeCheckGroups(answerBody: string) {
  const solutionBody = answerBody.replace(/\*\*Question:\*\*[^\n]*/gi, '');

  const seenRequired = new Set<string>();
  const seenAlternative = new Set<string>();
  const required: CmdCheck[] = [];
  const alternatives: CmdCheck[] = [];
  const pathGroups: string[][] = [];

  const addCheck = (list: CmdCheck[], label: string, alternative: boolean) => {
    const clean = stripInlineComment(label);
    const normalized = normalizeCmdLine(clean);
    if (!normalized || !isValidCommandLine(clean)) return;
    if (alternative) {
      if (seenAlternative.has(clean)) return;
      seenAlternative.add(clean);
    } else {
      if (seenRequired.has(normalized)) return;
      seenRequired.add(normalized);
    }
    list.push({ label: clean, normalized, alternative });
  };

  const blocks = extractBashBlocks(solutionBody);
  let proseAltPending = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const before = solutionBody.slice(i === 0 ? 0 : blocks[i - 1].end, block.index);
    if (/Alternatively/i.test(before)) proseAltPending = true;

    const paths = parseBashBlockIntoPaths(block.content);

    if (proseAltPending) {
      for (const path of paths) {
        for (const cmd of path.commands) addCheck(alternatives, cmd, true);
      }
      proseAltPending = false;
      continue;
    }

    if (paths.length > 1) {
      for (const path of paths) {
        pathGroups.push(path.commands);
      }
      continue;
    }

    for (const path of paths) {
      for (const cmd of path.commands) {
        if (cmd.includes('|')) {
          addCheck(alternatives, cmd, true);
        } else {
          addCheck(required, cmd, false);
        }
      }
    }
  }

  return {
    required: required.slice(0, 8),
    alternatives: alternatives.slice(0, 4),
    pathGroups,
  };
}

function scorePathGroup(commands: string[], history: string) {
  const results = commands.map((cmd) => {
    const normalized = normalizeCmdLine(stripInlineComment(cmd));
    const { pass, reason } = commandMatches(normalized, history);
    return { label: cmd, pass, reason };
  });
  const allPass = results.length > 0 && results.every((r) => r.pass);
  return { commands, results, allPass };
}

/**
 * Cluster-state check: did the student's work actually land in this question's
 * assigned namespace (exam.json `namespace` field, resolved via
 * initialNamespaceForQuestion server-side)? Skipped for `default` — that's the
 * catch-all for scenario-backed questions and unassigned namespaces, where
 * "resources exist in default" isn't a meaningful signal.
 */
function scoreNamespaceCheck(qIdx: number, evidence: Evidence | null): PracticeCheck | null {
  const cs = evidence?.clusterState?.[String(qIdx)];
  if (!cs || cs.namespace === 'default') return null;

  const hasResources = Object.values(cs.resources || {}).some(
    (r) =>
      Array.isArray((r as { items?: unknown[] } | null)?.items) &&
      (r as { items: unknown[] }).items.length > 0
  );

  return {
    label: `Work done in namespace \`${cs.namespace}\``,
    pass: hasResources,
    reason: hasResources
      ? `Resources found in namespace ${cs.namespace}`
      : `No resources found in namespace ${cs.namespace} — this question's terminal starts in that namespace by default`,
    alternative: false,
  };
}

export function scorePracticeQuestion(
  qIdx: number,
  answer: AnswerEntry,
  evidence: Evidence | null
): PracticeScoreResult {
  if (!answer) {
    return {
      checks: [],
      alternativeChecks: [],
      pathGroups: [],
      scorePercent: 0,
      passed: 0,
      total: 0,
    };
  }

  const namespaceCheck = scoreNamespaceCheck(qIdx, evidence);

  const { required, alternatives, pathGroups } = extractPracticeCheckGroups(answer.body);
  if (required.length === 0 && pathGroups.length === 0) {
    const checks: PracticeCheck[] = [
      {
        label: 'Review solution manually',
        pass: null,
        reason: 'No auto-checks extracted for this question',
      },
    ];
    if (namespaceCheck) checks.push(namespaceCheck);
    return {
      checks,
      alternativeChecks: [],
      pathGroups: [],
      scorePercent: namespaceCheck ? (namespaceCheck.pass ? 100 : 0) : 0,
      passed: namespaceCheck?.pass ? 1 : 0,
      total: namespaceCheck ? 1 : 0,
    };
  }

  const qCmds = (evidence?.commands[String(qIdx)] || []).join('\n').toLowerCase();
  const appliedText = Object.values(evidence?.applied || {})
    .join('\n')
    .toLowerCase();
  const allFileText = Object.values(evidence?.files || {})
    .join('\n')
    .toLowerCase();
  const history = [qCmds, appliedText, allFileText].join('\n');

  const scoreOne = (check: CmdCheck) => {
    const { pass, reason } = commandMatches(check.normalized, history);
    return { label: check.label, pass, reason, alternative: check.alternative };
  };

  const checks = required.map(scoreOne);
  const alternativeChecks = alternatives.map(scoreOne);

  const scoredPathGroups = pathGroups.map((commands, i) => ({
    index: i + 1,
    ...scorePathGroup(commands, history),
  }));

  const pathGroupChecks = scoredPathGroups.map((pg) => ({
    label: pg.commands.join(' → '),
    pass: pg.allPass,
    reason: pg.allPass
      ? 'This approach completed successfully'
      : pg.results
          .filter((r) => !r.pass)
          .map((r) => r.reason)
          .join('; ') || 'Incomplete',
    alternative: false,
    isPathGroup: true,
    subResults: pg.results,
  }));

  const pathOrCheck =
    pathGroups.length > 0
      ? {
          label:
            pathGroups.length === 1 ? pathGroupChecks[0].label : 'Complete the task (one approach)',
          pass: scoredPathGroups.some((pg) => pg.allPass),
          reason: scoredPathGroups.some((pg) => pg.allPass)
            ? 'At least one approach completed successfully'
            : 'Try one of the alternative approaches below',
          isPathOr: true,
          paths: pathGroupChecks,
        }
      : null;

  // Path groups are OR — only one path required
  let adjustedPassed = checks.filter((r) => r.pass).length;
  let adjustedTotal = checks.length;
  if (pathOrCheck) {
    adjustedTotal += 1;
    if (pathOrCheck.pass) adjustedPassed += 1;
  }
  if (namespaceCheck) {
    adjustedTotal += 1;
    if (namespaceCheck.pass) adjustedPassed += 1;
  }

  const scorePercent = adjustedTotal > 0 ? Math.round((adjustedPassed / adjustedTotal) * 100) : 0;

  const allChecks: PracticeCheck[] = pathOrCheck ? [...checks, pathOrCheck] : checks;
  if (namespaceCheck) allChecks.push(namespaceCheck);

  return {
    checks: allChecks,
    alternativeChecks,
    pathGroups: scoredPathGroups,
    scorePercent,
    passed: adjustedPassed,
    total: adjustedTotal,
  };
}

export function renderCheckItem(
  check: PracticeCheck,
  { optional = false }: { optional?: boolean } = {}
): string {
  const isPickOne = check.isPathOr;
  const isOptional = optional || check.alternative;

  let icon;
  let cls;
  if (isPickOne) {
    icon = check.pass ? '✅' : '❌';
    cls = check.pass ? 'pass' : 'fail';
  } else if (isOptional) {
    icon = check.pass === true ? '✓' : '◦';
    cls = check.pass === true ? 'optional-pass' : 'optional-info';
  } else {
    icon = check.pass === true ? '✅' : check.pass === false ? '❌' : 'ℹ️';
    cls = check.pass === true ? 'pass' : check.pass === false ? 'fail' : '';
  }

  const badge = isPickOne
    ? '<span class="practice-check-badge pick-one">pick one</span>'
    : isOptional
      ? '<span class="practice-check-badge optional">optional</span>'
      : '';

  const showReason = !(isOptional && !check.pass);
  const reason = showReason ? check.reason || '' : '';

  let subHtml = '';
  if (isPickOne && check.paths?.length) {
    subHtml = `<div class="practice-sub-steps">${check.paths
      .map((pg, i) => {
        const pgIcon = pg.pass ? '✓' : '✗';
        const pgCls = pg.pass ? 'pass' : 'fail';
        const steps =
          pg.subResults
            ?.map(
              (sr) =>
                `<div class="practice-sub-cmd ${sr.pass ? 'pass' : 'fail'}"><span class="practice-sub-mark">${sr.pass ? '✓' : '✗'}</span>${escapeHtml(sr.label)}</div>`
            )
            .join('') || '';
        return `<div class="practice-sub-group ${pgCls}"><div class="practice-sub-label">${pgIcon} Option ${i + 1}</div>${steps}</div>`;
      })
      .join('')}</div>`;
  }

  const label =
    isPickOne && (check.paths?.length ?? 0) > 1 ? 'One of these approaches' : check.label;

  return `
    <div class="practice-check-item ${cls} ${isOptional ? 'optional' : ''}">
      <span class="practice-check-icon">${icon}</span>
      <div class="practice-check-label">
        ${badge}<span class="practice-check-cmd">${escapeHtml(label)}</span>
        ${reason ? `<span class="practice-check-reason">${escapeHtml(reason)}</span>` : ''}
        ${subHtml}
      </div>
    </div>`;
}

export function renderPracticeFeedback(
  result: PracticeScoreResult,
  answer: AnswerEntry | null | undefined
): void {
  const pill = $('#practiceScorePill');
  pill.classList.remove('pass', 'partial');

  const ringEl = document.getElementById('practiceScoreRing');
  if (ringEl) updateScoreRing(ringEl, result.total === 0 ? 0 : result.scorePercent);

  if (result.total === 0) {
    pill.textContent = '—';
  } else if (result.scorePercent === 100) {
    pill.textContent = `${result.scorePercent}%`;
    pill.classList.add('pass');
  } else if (result.scorePercent >= 50) {
    pill.textContent = `${result.scorePercent}% (${result.passed}/${result.total})`;
    pill.classList.add('partial');
  } else {
    pill.textContent = `${result.scorePercent}% (${result.passed}/${result.total})`;
  }

  const items = [
    ...result.checks.map((c) => ({ check: c, optional: false })),
    ...(result.alternativeChecks || []).map((c) => ({ check: c, optional: true })),
  ];

  $('#practiceChecks').innerHTML = items
    .map(({ check, optional }) => renderCheckItem(check, { optional }))
    .join('');

  let breakdown = document.getElementById('practiceScoreBreakdown');
  if (!breakdown) {
    breakdown = document.createElement('div');
    breakdown.id = 'practiceScoreBreakdown';
    breakdown.className = 'score-breakdown';
    $('#practiceChecks').before(breakdown);
  }
  if (result.total > 0) {
    breakdown.classList.remove('hidden');
    breakdown.innerHTML = `
      <div class="score-breakdown-label">${result.passed}/${result.total} steps passed</div>
      <div class="score-breakdown-track">
        <div class="score-breakdown-pass" style="width:${result.scorePercent}%"></div>
        <div class="score-breakdown-fail" style="width:${100 - result.scorePercent}%"></div>
      </div>`;
  } else {
    breakdown.classList.add('hidden');
    breakdown.innerHTML = '';
  }

  const altSection = $('#practiceAlternatives');
  if (altSection) {
    altSection.classList.add('hidden');
    altSection.innerHTML = '';
  }

  if (answer) {
    const solutionHtml = answer.body
      .replace(/\*\*Question:\*\*[^\n]*\n*/i, '')
      .replace(/\*\*Solution:\*\*\s*/i, '')
      .trim();
    $('#practiceSolution').innerHTML = marked.parse(solutionHtml);
  } else {
    $('#practiceSolution').innerHTML = '<p style="color:#999">No solution available.</p>';
  }
}

export { normalizeCmdLine, commandMatches };
