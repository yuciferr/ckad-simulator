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
  registerExpressErrorHandler(app);

  return { app, server };
}
