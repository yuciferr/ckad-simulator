const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { createExamRoutes } = require('./routes/exams');
const { createSessionRoutes } = require('./routes/session');
const { attachTerminalWebSocket } = require('./ws/terminal');

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server, path: '/ws' });

  app.use(express.static(PUBLIC_DIR));
  app.use(express.json());

  createExamRoutes(app);
  createSessionRoutes(app);
  attachTerminalWebSocket(wss);

  return { app, server };
}

module.exports = { createApp };
