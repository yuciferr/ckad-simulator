/** kubectl resource / flag synonyms (long form → accepted short forms in history) */
export const K8S_TOKEN_ALIASES = {
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
export function normalizeHistoryText(text) {
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
export function tokenInHistory(token, history) {
    if (!token)
        return true;
    const t = token.toLowerCase();
    const forms = K8S_TOKEN_ALIASES[t] || [t];
    for (const form of forms) {
        const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|[\\s;|&"'=(])${escaped}(?:$|[\\s;|&"'=/])`);
        if (re.test(history))
            return true;
    }
    return false;
}
const VERB_ALIASES = {
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
export function commandAssertionMatches(cmd, historyRaw) {
    const h = normalizeHistoryText(historyRaw);
    if (cmd.verb) {
        const accepted = VERB_ALIASES[cmd.verb] || [cmd.verb];
        const verbRe = new RegExp(`(?:^|[\\s;|&(])k\\s+(?:[a-z-]+\\s+)*(?:${accepted.join('|')})\\b`, 'm');
        if (!verbRe.test(h))
            return false;
    }
    if (cmd.resource && !tokenInHistory(cmd.resource, h))
        return false;
    if (cmd.contains) {
        for (const tok of cmd.contains) {
            if (!h.includes(tok.toLowerCase()))
                return false;
        }
    }
    return true;
}
/** Resolve a dot path (with [*] wildcard and [N] index) to a flat list of values. */
function resolvePath(root, path) {
    if (!path)
        return root === undefined ? [] : [root];
    const segments = path.split('.');
    let current = [root];
    for (const seg of segments) {
        const next = [];
        const m = seg.match(/^([^[]*)((?:\[[^\]]*\])*)$/);
        const key = m ? m[1] : seg;
        const brackets = m ? m[2] : '';
        for (const node of current) {
            let vals = [node];
            if (key) {
                const obj = node;
                if (obj == null || typeof obj !== 'object') {
                    vals = [];
                }
                else {
                    vals = obj[key] === undefined ? [] : [obj[key]];
                }
            }
            // apply any [*] / [N] accessors
            const accessors = brackets.match(/\[[^\]]*\]/g) || [];
            for (const acc of accessors) {
                const inner = acc.slice(1, -1);
                const expanded = [];
                for (const v of vals) {
                    if (!Array.isArray(v))
                        continue;
                    if (inner === '*')
                        expanded.push(...v);
                    else {
                        const idx = parseInt(inner, 10);
                        if (!Number.isNaN(idx) && idx < v.length)
                            expanded.push(v[idx]);
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
function itemsFor(evidence, qIdx, resource) {
    const bucket = evidence.clusterState?.[String(qIdx)]?.resources?.[resource];
    const items = bucket?.items;
    return Array.isArray(items) ? items : [];
}
function matchByName(items, name) {
    if (!name)
        return items;
    return items.filter((it) => it.metadata?.name === name);
}
/** The literal a resource check hopes to find, for the text fallback. */
function checkLiteral(check) {
    if (check.contains !== undefined)
        return String(check.contains);
    if (check.equals !== undefined)
        return String(check.equals);
    if (check.has)
        return check.has.split('.').pop().replace(/\[.*\]/g, '');
    if (check.path)
        return check.path.split('.').pop().replace(/\[.*\]/g, '');
    return null;
}
function evalResourceCheck(check, qIdx, evidence, fallbackText) {
    const weight = check.weight ?? 1;
    const resource = check.resource;
    const items = matchByName(itemsFor(evidence, qIdx, resource), check.name);
    const path = check.has || check.path;
    const values = path ? items.flatMap((it) => resolvePath(it, path)) : items;
    let pass = false;
    if (check.has) {
        pass = values.length > 0;
    }
    else if (check.count !== undefined) {
        pass = values.length === check.count;
    }
    else if (check.gte !== undefined) {
        const nums = values.map(Number).filter((n) => !Number.isNaN(n));
        pass = nums.some((n) => n >= check.gte) || values.length >= check.gte;
    }
    else if (check.equals !== undefined) {
        const want = String(check.equals).toLowerCase();
        pass = values.some((v) => String(v).toLowerCase() === want);
    }
    else if (check.contains !== undefined) {
        const want = String(check.contains).toLowerCase();
        pass = values.some((v) => String(v).toLowerCase().includes(want));
    }
    else {
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
function reasonForFail(check, resource) {
    const who = check.name ? `${resource}/${check.name}` : resource;
    if (check.count !== undefined)
        return `Expected ${check.count} — not found in ${who}`;
    if (check.gte !== undefined)
        return `Expected at least ${check.gte} in ${who}`;
    if (check.equals !== undefined)
        return `Expected ${check.path} = ${check.equals} in ${who}`;
    if (check.contains !== undefined)
        return `Expected ${check.path} to contain "${check.contains}" in ${who}`;
    if (check.has)
        return `${check.has} not set on ${who}`;
    return check.exists === false ? `${who} still exists` : `${who} not found`;
}
/** Evaluate every check for one question. Pure; no DOM/side effects. */
export function evaluateChecks(checks, qIdx, evidence) {
    if (!checks || checks.length === 0)
        return [];
    const ev = evidence || { commands: {}, applied: {}, files: {} };
    const qCmds = (ev.commands[String(qIdx)] || []).join('\n');
    const fileText = Object.values(ev.files || {}).join('\n');
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
            const base = check.file.split('/').pop();
            const entry = Object.entries(ev.files || {}).find(([k]) => k === target || k.endsWith('/' + base) || k.endsWith(base));
            let pass = !!entry;
            if (pass && check.fileContains) {
                pass = (entry[1] || '').toLowerCase().includes(check.fileContains.toLowerCase());
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
export function scoreFromChecks(results) {
    const gradable = results.filter((r) => r.pass !== null);
    const total = gradable.length;
    const passed = gradable.filter((r) => r.pass === true).length;
    const totalWeight = gradable.reduce((s, r) => s + r.weight, 0);
    const earnedWeight = gradable.filter((r) => r.pass === true).reduce((s, r) => s + r.weight, 0);
    const scorePercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    return { scorePercent, passed, total };
}
