import path from 'path';

export const PORT = Number(process.env.PORT) || 3000;
export const HOST = process.env.HOST || '127.0.0.1';
export const ROOT_DIR = path.join(__dirname, '..');
export const EXAMS_DIR = path.join(ROOT_DIR, 'exams');
export const SANDBOX_DIR = path.join(ROOT_DIR, 'sandbox');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const SHELL = '/bin/bash';
export const EXAMS_DIR_RESOLVED = path.resolve(EXAMS_DIR);

export type SandboxMode = 'kind' | 'simulation';

/** kind is the only supported mode; `SANDBOX_MODE=simulation` is a legacy no-op escape hatch. */
export const SANDBOX_MODE: SandboxMode =
  process.env.SANDBOX_MODE === 'simulation' ? 'simulation' : 'kind';

export const KUBECONFIG_PATH =
  process.env.KUBECONFIG || path.join('/etc/kind/kubeconfig');

export const KIND_CLUSTER_NAME = process.env.KIND_CLUSTER_NAME || 'ckad-simulator';

export const CKAD_BASHRC = process.env.CKAD_BASHRC || '/etc/ckad/bashrc';

export const MOCK_SCENARIO_NAMESPACE_PREFIX = 'exam-q';

/**
 * Fallback bucket size used only when a practice question is missing its
 * persisted `namespace` field (scripts/assign-practice-namespaces.js is the
 * source of truth and assigns namespaces as continuous segments, not fixed
 * buckets — see fallbackPracticeNamespace() in src/sandbox/scenario.ts).
 */
export const PRACTICE_NAMESPACE_GROUP_SIZE = 5;

/** Course task files — writable copy lives under sandbox/opt/course at runtime. */
export const COURSE_DIR =
  process.env.COURSE_DIR || path.join(SANDBOX_DIR, 'opt', 'course');

export const TOPIC_EXAM_ORDER = [
  'core_concepts',
  'multi_container_pods',
  'pod_design',
  'configuration',
  'observability',
  'services',
  'state',
  'helm',
  'crd',
  'podman',
];
