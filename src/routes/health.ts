import { Express, Request, Response } from 'express';
import { SANDBOX_MODE } from '../config';
import { discoverExams } from '../exam/registry';
import { getClusterStatus } from '../sandbox/cluster';

export function createHealthRoutes(app: Express): void {
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const exams = discoverExams();
      let clusterReady = true;
      let cluster: Record<string, unknown> | undefined;

      if (SANDBOX_MODE === 'kind') {
        const status = await getClusterStatus();
        clusterReady = status.ready;
        cluster = {
          ready: status.ready,
          nodes: status.nodes,
          version: status.version,
        };
      }

      const payload = {
        status: clusterReady ? 'ok' : 'initializing',
        mode: SANDBOX_MODE,
        cluster,
        exams: exams.length,
        uptime: Math.floor(process.uptime()),
      };

      res.status(clusterReady ? 200 : 503).json(payload);
    } catch (err) {
      res.status(503).json({ status: 'error', message: (err as Error).message });
    }
  });
}
