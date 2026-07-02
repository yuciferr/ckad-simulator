import { Express, Request, Response } from 'express';
import { resetSandboxStateAsync } from '../sandbox/reset';
import { collectEvidence } from '../sandbox/evidence';

export function createSessionRoutes(app: Express): void {
  app.post('/api/sandbox/reset', async (req: Request, res: Response) => {
    try {
      const result = await resetSandboxStateAsync(req.body?.examId ?? null);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/session/evidence', (_req: Request, res: Response) => {
    try {
      res.json(collectEvidence());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
