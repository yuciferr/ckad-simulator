import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { evaluateChecks, scoreFromChecks } from '../src/client/scoring/checks';
import type { Check } from '../src/client/scoring/checks';
import type { Evidence } from '../src/client/types';
import { isUnmodifiedSeedFile } from '../src/sandbox/evidence';

/**
 * Reproduces what an untouched mock exam looks like on the grading side: the
 * scenario's setup.yaml has been applied (so any pre-seeded Deployments/Pods/etc
 * are live), but the student typed no commands and wrote no files. This is the
 * exact shape that exposed CX-3 — bare `exists: true` checks and `equals`/`contains`
 * checks against a pre-seeded resource's starting value passed vacuously even
 * though the student never touched the cluster.
 */

const KIND_TO_BUCKET: Record<string, string> = {
  Pod: 'pods',
  Deployment: 'deployments',
  Service: 'services',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  CronJob: 'cronjobs',
  Job: 'jobs',
  Ingress: 'ingresses',
  PersistentVolumeClaim: 'persistentvolumeclaims',
  ServiceAccount: 'serviceaccounts',
  Role: 'roles',
  RoleBinding: 'rolebindings',
  NetworkPolicy: 'networkpolicies',
  ResourceQuota: 'resourcequotas',
  HorizontalPodAutoscaler: 'horizontalpodautoscalers',
  DaemonSet: 'daemonsets',
};

interface AnswerFile {
  answers: { number: number; checks?: Check[] }[];
}

interface ExamFile {
  questions: { number: number; weight: number }[];
}

/** Cluster state seeded purely from a question's setup.yaml — no student action. */
function seededResources(mockDir: string, qNumber: number): Record<string, { items: unknown[] }> {
  const setupPath = path.join(mockDir, 'scenarios', `q${qNumber}`, 'setup.yaml');
  if (!fs.existsSync(setupPath)) return {};
  const docs = (yaml.loadAll(fs.readFileSync(setupPath, 'utf-8')) as { kind?: string }[]).filter(Boolean);
  const byResource: Record<string, { items: unknown[] }> = {};
  for (const doc of docs) {
    const bucket = doc.kind ? KIND_TO_BUCKET[doc.kind] : undefined;
    if (!bucket) continue;
    if (!byResource[bucket]) byResource[bucket] = { items: [] };
    byResource[bucket].items.push(doc);
  }
  return byResource;
}

/**
 * `/opt/course` starter files as they exist the moment a scenario is seeded —
 * byte-identical to the exam bundle's `course/` dir, since `seedCourseFromExam`
 * just copies it. Keyed the same way `collectCourseFiles` keys `Evidence.files`.
 */
function seededCourseFiles(mockDir: string): Record<string, string> {
  const courseDir = path.join(mockDir, 'course');
  const files: Record<string, string> = {};
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
      files[rel] = fs.readFileSync(full, 'utf-8');
    }
  };
  walk(courseDir, 'opt/course');
  return files;
}

/** Applies the same seed-exclusion collectCourseFiles (src/sandbox/evidence.ts) applies. */
function filterUnmodifiedSeeds(mockDir: string, raw: Record<string, string>): Record<string, string> {
  const seedDir = path.join(mockDir, 'course');
  const out: Record<string, string> = {};
  for (const [rel, content] of Object.entries(raw)) {
    if (isUnmodifiedSeedFile(seedDir, rel, content)) continue;
    out[rel] = content;
  }
  return out;
}

/** Mirrors screens/review.ts updateScore(): per-question weight, ratio of checked criteria. */
function weightedScore(
  mockDir: string,
  exam: ExamFile,
  answers: AnswerFile,
  files: Record<string, string> = {}
): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const q of exam.questions) {
    const a = answers.answers.find((ans) => ans.number === q.number);
    const checkCount = a?.checks?.length ?? 0;
    if (!a || checkCount === 0) continue;

    totalWeight += q.weight;

    const resources = seededResources(mockDir, q.number);
    const evidence: Evidence = {
      commands: {},
      applied: {},
      files,
      clusterState: { [String(q.number - 1)]: { namespace: 'ns', resources } },
    };
    const results = evaluateChecks(a.checks, q.number - 1, evidence);
    const { passed, total } = scoreFromChecks(results);
    const ratio = total > 0 ? passed / total : 0;
    earnedWeight += q.weight * ratio;
  }

  return totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
}

describe('mock exam empty attempt scores 0%', () => {
  for (const mockId of ['1', '2']) {
    it(`mock/${mockId}: no commands, no cluster changes -> 0%`, () => {
      const mockDir = path.join(__dirname, '..', 'exams', 'mock', mockId);
      const exam = JSON.parse(fs.readFileSync(path.join(mockDir, 'exam.json'), 'utf-8')) as ExamFile;
      const answers = JSON.parse(fs.readFileSync(path.join(mockDir, 'answer.json'), 'utf-8')) as AnswerFile;

      expect(weightedScore(mockDir, exam, answers)).toBe(0);
    });

    it(`mock/${mockId}: untouched /opt/course seed files present -> still 0% (CX-6)`, () => {
      // Reproduces the CX-6 regression: on a real empty attempt, /opt/course
      // is seeded with the exam's starter YAML (session-17's synthetic
      // `files: {}` never modeled this). Without filtering, checks.ts's
      // text-fallback path matches a check's literal (e.g. a port number, or
      // a "rewrite to X" comment that contains the target string X) against
      // that untouched starter content and awards points nobody earned.
      const mockDir = path.join(__dirname, '..', 'exams', 'mock', mockId);
      const exam = JSON.parse(fs.readFileSync(path.join(mockDir, 'exam.json'), 'utf-8')) as ExamFile;
      const answers = JSON.parse(fs.readFileSync(path.join(mockDir, 'answer.json'), 'utf-8')) as AnswerFile;

      const raw = seededCourseFiles(mockDir);
      const filtered = filterUnmodifiedSeeds(mockDir, raw);

      expect(weightedScore(mockDir, exam, answers, filtered)).toBe(0);
    });
  }
});

describe('isUnmodifiedSeedFile guards the text-fallback vacuous-pass path', () => {
  it('flags byte-identical content as unmodified', () => {
    const mockDir = path.join(__dirname, '..', 'exams', 'mock', '1');
    const seedDir = path.join(mockDir, 'course');
    const rel = 'opt/course/p1/project-23-api.yaml';
    const content = fs.readFileSync(path.join(seedDir, 'p1', 'project-23-api.yaml'), 'utf-8');

    expect(isUnmodifiedSeedFile(seedDir, rel, content)).toBe(true);
  });

  it('treats student-edited content as modified', () => {
    const mockDir = path.join(__dirname, '..', 'exams', 'mock', '1');
    const seedDir = path.join(mockDir, 'course');
    const rel = 'opt/course/p1/project-23-api.yaml';
    const original = fs.readFileSync(path.join(seedDir, 'p1', 'project-23-api.yaml'), 'utf-8');
    const edited = original + '\n# student added a livenessProbe above\n';

    expect(isUnmodifiedSeedFile(seedDir, rel, edited)).toBe(false);
  });
});
