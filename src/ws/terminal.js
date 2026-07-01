const path = require('path');
const pty = require('node-pty');
const WebSocket = require('ws');
const { SANDBOX_DIR, SHELL } = require('../config');
const { recordTerminalInput } = require('../terminal/capture');
const { terminalInputBuffers } = require('../sandbox/reset');

let wsCounter = 0;

function attachTerminalWebSocket(wss) {
  wss.on('connection', (ws) => {
    wsCounter += 1;
    const terminals = new Map();

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const qId = msg.questionId;

      switch (msg.type) {
        case 'create': {
          if (terminals.has(qId)) {
            ws.send(JSON.stringify({ type: 'created', questionId: qId }));
            return;
          }

          terminalInputBuffers.delete(String(qId));

          const cols = Math.max(msg.cols || 80, 2);
          const rows = Math.max(msg.rows || 30, 2);

          let shell;
          try {
            const sandboxBin = path.join(SANDBOX_DIR, 'bin');
            const systemPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';

            shell = pty.spawn(SHELL, ['--init-file', path.join(SANDBOX_DIR, '.bashrc')], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd: SANDBOX_DIR,
              env: {
                TERM: 'xterm-256color',
                HOME: SANDBOX_DIR,
                SANDBOX_ROOT: SANDBOX_DIR,
                PATH: `${sandboxBin}:${systemPath}`,
                USER: 'student',
                SHELL: '/bin/bash',
                LANG: process.env.LANG || 'en_US.UTF-8',
                CKAD_QUESTION: String(qId),
                EDITOR: 'vim',
                KUBE_EDITOR: 'vim',
                KUBECONFIG: '/dev/null',
                REAL_HOME: process.env.HOME || '',
                BASH_SILENCE_DEPRECATION_WARNING: '1',
              },
            });
          } catch (err) {
            console.error(`PTY spawn failed for Q${qId}:`, err.message);
            ws.send(JSON.stringify({ type: 'error', questionId: qId, message: err.message }));
            return;
          }

          shell.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'output', questionId: qId, data }));
            }
          });

          shell.on('exit', () => {
            terminals.delete(qId);
          });

          terminals.set(qId, shell);
          ws.send(JSON.stringify({ type: 'created', questionId: qId }));
          break;
        }

        case 'input': {
          const term = terminals.get(qId);
          if (term) {
            recordTerminalInput(String(qId), msg.data);
            term.write(msg.data);
          }
          break;
        }

        case 'resize': {
          const term = terminals.get(qId);
          if (term) {
            try {
              term.resize(msg.cols, msg.rows);
            } catch { /* ignore resize errors */ }
          }
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      for (const [, shell] of terminals) {
        try { shell.kill(); } catch { /* ignore */ }
      }
      terminals.clear();
    });
  });
}

module.exports = { attachTerminalWebSocket };
