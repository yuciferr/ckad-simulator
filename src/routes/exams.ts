import { Express, Request, Response } from 'express';
import { discoverExams, examSortKey, getExamPayload, getAnswersPayload } from '../exam/registry';

export function createExamRoutes(app: Express): void {
  app.get('/api/exams', (_req: Request, res: Response) => {
    try {
      const exams = discoverExams().sort((a, b) => examSortKey(a).localeCompare(examSortKey(b)));
      res.json(exams);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/exams/:id', (req: Request, res: Response) => {
    try {
      const payload = getExamPayload(req.params.id);
      if (!payload) return res.status(404).json({ error: 'Exam not found' });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/exams/:id/answers', (req: Request, res: Response) => {
    try {
      const answers = getAnswersPayload(req.params.id);
      if (!answers) return res.status(404).json({ error: 'Answers not found' });
      res.json(answers);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
