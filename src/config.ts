import path from 'path';

export const PORT = Number(process.env.PORT) || 3000;
export const HOST = process.env.HOST || '127.0.0.1';
export const ROOT_DIR = path.join(__dirname, '..');
export const EXAMS_DIR = path.join(ROOT_DIR, 'exams');
export const SANDBOX_DIR = path.join(ROOT_DIR, 'sandbox');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const SHELL = '/bin/bash';
export const EXAMS_DIR_RESOLVED = path.resolve(EXAMS_DIR);
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
