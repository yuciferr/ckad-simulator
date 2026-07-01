import { Express, Request, Response } from 'express';
import { discoverExams } from '../exam/registry';

export function createHealthRoutes(app: Express): void {
  app.get('/health', (_req: Request, res: Response) => {
    try {
      const exams = discoverExams();
      res.json({
        status: 'ok',
        exams: exams.length,
        uptime: Math.floor(process.uptime()),
      });
    } catch (err) {
      res.status(503).json({ status: 'error', message: (err as Error).message });
    }
  });
}
