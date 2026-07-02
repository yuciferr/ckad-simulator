import path from 'path';
import express, { Express } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { PUBLIC_DIR } from './config';
import { createExamRoutes } from './routes/exams';
import { createSessionRoutes } from './routes/session';
import { createHealthRoutes } from './routes/health';
import { attachTerminalWebSocket } from './ws/terminal';
import { registerExpressErrorHandler } from './middleware/errors';

export function createApp(): { app: Express; server: http.Server } {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.static(PUBLIC_DIR));
  app.use(express.json());

  createHealthRoutes(app);
  createExamRoutes(app);
  createSessionRoutes(app);
  attachTerminalWebSocket(wss);

  // SPA fallback — client-side routes (/exam/...) refresh without 404
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  registerExpressErrorHandler(app);

  return { app, server };
}
