const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '127.0.0.1',
  ROOT_DIR,
  EXAMS_DIR: path.join(ROOT_DIR, 'exams'),
  SANDBOX_DIR: path.join(ROOT_DIR, 'sandbox'),
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  SHELL: '/bin/bash',
  EXAMS_DIR_RESOLVED: path.resolve(path.join(ROOT_DIR, 'exams')),
  TOPIC_EXAM_ORDER: [
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
  ],
};
