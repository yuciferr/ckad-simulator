import { describe, expect, it } from 'vitest';
import { extractNamespacesFromText, parseQuestions, parseAnswers } from '../src/exam/md-parser';

describe('extractNamespacesFromText', () => {
  it('extracts namespace from backtick patterns', () => {
    const ns = extractNamespacesFromText("Work in Namespace `earth` and namespace `mars`");
    expect(ns).toContain('earth');
    expect(ns).toContain('mars');
  });

  it('returns empty array when no namespaces', () => {
    expect(extractNamespacesFromText('Create a pod in default')).toEqual([]);
  });
});

describe('parseQuestions', () => {
  it('parses question headers and weights', () => {
    const content = `# Question 1 | Pod fix
weight: 7%

Fix the pod.

# Question 2 | Service
weight: 5%

Create a service.
`;
    const questions = parseQuestions(content);
    expect(questions).toHaveLength(2);
    expect(questions[0].number).toBe(1);
    expect(questions[0].weight).toBe(7);
    expect(questions[1].title).toBe('Service');
  });
});

describe('parseAnswers', () => {
  it('extracts scoring criteria from checkboxes', () => {
    const content = `# Answer 1

- [ ] Pod is Running
- [ ] Probe configured
`;
    const answers = parseAnswers(content);
    expect(answers[0].criteria).toEqual(['Pod is Running', 'Probe configured']);
  });
});
