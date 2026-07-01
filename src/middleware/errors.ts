import { Express, NextFunction, Request, Response } from 'express';

export function registerProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
  });
}

export function registerExpressErrorHandler(app: Express): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[express]', err.message);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });
}
