import { Express, Request, Response } from 'express';
import { resetSandboxState } from '../sandbox/reset';
import { collectEvidence } from '../sandbox/evidence';

export function createSessionRoutes(app: Express): void {
  app.post('/api/sandbox/reset', (req: Request, res: Response) => {
    try {
      resetSandboxState(req.body?.examId ?? null);
      res.json({ ok: true });
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
