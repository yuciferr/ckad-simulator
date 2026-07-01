import { describe, expect, it } from 'vitest';
import {
  isSafeExamId,
  resolveExamPaths,
  discoverExams,
  getExamPayload,
} from '../src/exam/registry';

describe('isSafeExamId', () => {
  it('accepts numeric mock ids and practice slugs', () => {
    expect(isSafeExamId('1')).toBe(true);
    expect(isSafeExamId('core_concepts')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(isSafeExamId('../etc/passwd')).toBe(false);
    expect(isSafeExamId('..')).toBe(false);
    expect(isSafeExamId('foo/bar')).toBe(false);
  });
});

describe('registry', () => {
  it('discovers mock and practice exams from manifest', () => {
    const exams = discoverExams();
    expect(exams.length).toBeGreaterThanOrEqual(11);
    expect(exams.some((e) => e.id === '1' && e.group === 'mock')).toBe(true);
    expect(exams.some((e) => e.id === 'core_concepts' && e.group === 'practice')).toBe(true);
  });

  it('loads mock exam payload with 17 questions', () => {
    const payload = getExamPayload('1');
    expect(payload).not.toBeNull();
    expect(payload!.questions).toHaveLength(17);
  });

  it('returns null for invalid exam id', () => {
    expect(resolveExamPaths('../../package.json')).toBeNull();
    expect(getExamPayload('../../package.json')).toBeNull();
  });
});
