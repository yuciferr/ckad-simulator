import { Express, Request, Response } from 'express';
import { resetSandboxStateAsync } from '../sandbox/reset';
import { collectEvidence } from '../sandbox/evidence';

function parseQuestionIndices(raw: unknown): number[] {
  if (raw == null || raw === '') return [];
  const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n) && n >= 0))];
}

export function createSessionRoutes(app: Express): void {
  app.post('/api/sandbox/reset', async (req: Request, res: Response) => {
    try {
      const result = await resetSandboxStateAsync(req.body?.examId ?? null);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/session/evidence', async (req: Request, res: Response) => {
    try {
      const questionIndices = parseQuestionIndices(req.query.questions);
      const evidence = await collectEvidence(
        questionIndices.length ? { questionIndices } : undefined
      );
      res.json(evidence);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
