import fs from 'fs';
import path from 'path';
import { SANDBOX_DIR, SANDBOX_MODE } from '../config';
import { getCourseDir } from './course';
import { kubectl } from './kubectl';
import { initialNamespaceForQuestion } from './scenario';
import { getCurrentExamId } from './reset';

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

export async function collectClusterState(
  questionIndices: number[],
  examId?: string | null
): Promise<Record<string, QuestionClusterState>> {
  const state: Record<string, QuestionClusterState> = {};
  const resolvedExamId = examId ?? getCurrentExamId();

  await Promise.all(
    questionIndices.map(async (index) => {
      const ns = resolvedExamId
        ? initialNamespaceForQuestion(resolvedExamId, index)
        : `exam-q${index + 1}`;
      state[String(index)] = {
        namespace: ns,
        resources: await getNamespaceResources(ns),
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

function collectCourseFiles(): Record<string, string> {
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
        /* skip binary */
      }
    }
  };
  walk(courseDir, 'opt/course');
  return files;
}

export async function collectEvidence(options?: {
  questionIndices?: number[];
}): Promise<Evidence> {
  const evidence: Evidence = {
    commands: collectCommandHistory(),
    applied: {},
    files: collectCourseFiles(),
  };

  if (SANDBOX_MODE === 'kind' && options?.questionIndices?.length) {
    evidence.clusterState = await collectClusterState(
      options.questionIndices,
      getCurrentExamId()
    );
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
