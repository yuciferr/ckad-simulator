import express, { Express } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { PUBLIC_DIR } from './config';
import { createExamRoutes } from './routes/exams';
import { createSessionRoutes } from './routes/session';
import { attachTerminalWebSocket } from './ws/terminal';

export function createApp(): { app: Express; server: http.Server } {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.static(PUBLIC_DIR));
  app.use(express.json());

  createExamRoutes(app);
  createSessionRoutes(app);
  attachTerminalWebSocket(wss);

  return { app, server };
}
