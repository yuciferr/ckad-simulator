import fs from 'fs';
import path from 'path';
import { SANDBOX_DIR, SANDBOX_MODE } from '../config';
import { getCourseDir } from './course';
import { kubectl } from './kubectl';
import { initialNamespaceForQuestion } from './scenario';
import { getCurrentExamId } from './reset';
import { runScenarioVerifyBatch } from './verify';
import { resolveExamPaths } from '../exam/registry';

export interface ClusterResourceList {
  items?: unknown[];
  [key: string]: unknown;
}

export interface QuestionClusterState {
  namespace: string;
  resources: Record<string, ClusterResourceList | null>;
}

export interface Evidence {
  commands: Record<string, string[]>;
  /** @deprecated Simulation-era applied YAML; empty in kind mode. */
  applied: Record<string, string>;
  files: Record<string, string>;
  clusterState?: Record<string, QuestionClusterState>;
  verify?: Record<string, { passed: boolean; output: string }>;
}

const CLUSTER_RESOURCES = [
  'pods',
  'deployments',
  'services',
  'configmaps',
  'secrets',
  'cronjobs',
  'jobs',
  'ingresses',
  'persistentvolumeclaims',
  'serviceaccounts',
  'roles',
  'rolebindings',
  'networkpolicies',
  'resourcequotas',
];

/**
 * Cluster-scoped kinds several storage/CRD practice questions create. They live
 * outside any namespace, so they're fetched cluster-wide once and merged into
 * every question's resource map (checks still filter by resource name).
 */
const CLUSTER_SCOPED_RESOURCES = ['persistentvolumes', 'storageclasses'];

async function getNamespaceResources(ns: string): Promise<Record<string, ClusterResourceList | null>> {
  const resources: Record<string, ClusterResourceList | null> = {};

  await Promise.all(
    CLUSTER_RESOURCES.map(async (resource) => {
      const result = await kubectl(`get ${resource} -n ${ns} -o json`, { timeoutMs: 10_000 });
      if (result.exitCode !== 0) {
        resources[resource] = null;
        return;
      }
      try {
        resources[resource] = JSON.parse(result.stdout) as ClusterResourceList;
      } catch {
        resources[resource] = null;
      }
    })
  );

  return resources;
}

async function getClusterScopedResources(): Promise<Record<string, ClusterResourceList | null>> {
  const resources: Record<string, ClusterResourceList | null> = {};
  await Promise.all(
    CLUSTER_SCOPED_RESOURCES.map(async (resource) => {
      const result = await kubectl(`get ${resource} -o json`, { timeoutMs: 10_000 });
      if (result.exitCode !== 0) {
        resources[resource] = null;
        return;
      }
      try {
        resources[resource] = JSON.parse(result.stdout) as ClusterResourceList;
      } catch {
        resources[resource] = null;
      }
    })
  );
  return resources;
}

export async function collectClusterState(
  questionIndices: number[],
  examId?: string | null
): Promise<Record<string, QuestionClusterState>> {
  const state: Record<string, QuestionClusterState> = {};
  const resolvedExamId = examId ?? getCurrentExamId();

  const clusterScoped = await getClusterScopedResources();

  await Promise.all(
    questionIndices.map(async (index) => {
      const ns = resolvedExamId
        ? initialNamespaceForQuestion(resolvedExamId, index)
        : `exam-q${index + 1}`;
      state[String(index)] = {
        namespace: ns,
        resources: { ...(await getNamespaceResources(ns)), ...clusterScoped },
      };
    })
  );

  return state;
}

function collectCommandHistory(): Record<string, string[]> {
  const commands: Record<string, string[]> = {};
  if (!fs.existsSync(SANDBOX_DIR)) return commands;

  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    const m = f.match(/^\.bash_history_q(\d+)$/);
    if (!m) continue;
    const raw = fs.readFileSync(path.join(SANDBOX_DIR, f), 'utf-8');
    commands[m[1]] = raw.split('\n').filter(Boolean);
  }
  return commands;
}

/**
 * Directory the exam bundle ships as the pristine `/opt/course` seed
 * (`seedCourseFromExam` copies it verbatim before the student touches
 * anything) — used to tell "student wrote/edited this" apart from
 * "this is still the untouched starter material". `null` when there's no
 * active exam (practice-without-course, or between sessions).
 */
export function courseSeedDir(examId: string | null): string | null {
  if (!examId) return null;
  const paths = resolveExamPaths(examId);
  if (!paths) return null;
  return path.join(path.dirname(paths.examPath), 'course');
}

/**
 * A resource/file check must never pass off content the student never
 * touched. `/opt/course` seeds starter YAML (the "original" the student is
 * told to copy/edit) that often already contains the literal values a check
 * looks for — e.g. a starter Deployment's `containerPort: 80` vacuously
 * satisfies a `livenessProbe...port equals 80` check via the text-fallback
 * path in checks.ts, and a "rewrite this to networking.k8s.io/v1" comment in
 * a deprecated-API starter file contains that exact string. Excluding any
 * file whose content is still byte-identical to the shipped seed closes both
 * classes of vacuous pass without touching individual answer.json checks.
 */
export function isUnmodifiedSeedFile(seedDir: string | null, rel: string, content: string): boolean {
  if (!seedDir) return false;
  const seedRel = rel.replace(/^opt[/\\]course[/\\]?/, '');
  if (!seedRel) return false;
  try {
    return fs.readFileSync(path.join(seedDir, seedRel), 'utf-8') === content;
  } catch {
    return false;
  }
}

function collectCourseFiles(examId: string | null): Record<string, string> {
  const files: Record<string, string> = {};
  const courseDir = getCourseDir();
  if (!fs.existsSync(courseDir)) return files;

  const seedDir = courseSeedDir(examId);

  const walk = (dir: string, relPrefix: string) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const rel = path.join(relPrefix, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (stat.size > 200_000) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        if (isUnmodifiedSeedFile(seedDir, rel, content)) continue;
        files[rel] = content;
      } catch {
        /* skip binary */
      }
    }
  };
  walk(courseDir, 'opt/course');
  return files;
}

/**
 * Capture YAML manifests the student authored in their working dir (HOME and
 * cwd are both SANDBOX_DIR — see src/ws/terminal.ts). Merged into `files` under
 * a `home/` prefix so a resource-shape check can still verify a pod/deployment
 * the student created from a file even after they deleted the live resource.
 */
function collectHomeManifests(): Record<string, string> {
  const files: Record<string, string> = {};
  if (!fs.existsSync(SANDBOX_DIR)) return files;
  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    if (!/\.ya?ml$/i.test(f)) continue;
    const full = path.join(SANDBOX_DIR, f);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 200_000) continue;
      files[path.join('home', f)] = fs.readFileSync(full, 'utf-8');
    } catch {
      /* skip */
    }
  }
  return files;
}

export async function collectEvidence(options?: {
  questionIndices?: number[];
}): Promise<Evidence> {
  const examId = getCurrentExamId();
  const evidence: Evidence = {
    commands: collectCommandHistory(),
    applied: {},
    files: { ...collectCourseFiles(examId), ...collectHomeManifests() },
  };

  if (SANDBOX_MODE === 'kind' && options?.questionIndices?.length) {
    evidence.clusterState = await collectClusterState(
      options.questionIndices,
      examId
    );
    if (examId) {
      evidence.verify = await runScenarioVerifyBatch(examId, options.questionIndices);
    }
  }

  return evidence;
}

/** Backward-compatible sync wrapper when cluster state is not needed. */
export function collectEvidenceSync(): Evidence {
  return {
    commands: collectCommandHistory(),
    applied: {},
    files: (() => {
      const files: Record<string, string> = {};
      const courseDir = getCourseDir();
      if (!fs.existsSync(courseDir)) return files;
      const walk = (dir: string, relPrefix: string) => {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          const rel = path.join(relPrefix, f);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full, rel);
            continue;
          }
          if (stat.size > 200_000) continue;
          try {
            files[rel] = fs.readFileSync(full, 'utf-8');
          } catch {
            /* skip */
          }
        }
      };
      walk(courseDir, 'opt/course');
      return files;
    })(),
  };
}
