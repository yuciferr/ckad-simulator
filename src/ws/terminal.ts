import path from 'path';
import * as pty from 'node-pty';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { SANDBOX_DIR, SHELL } from '../config';
import { recordTerminalInput } from '../terminal/capture';
import { terminalInputBuffers } from '../sandbox/reset';

interface TerminalMessage {
  type: string;
  questionId: number;
  cols?: number;
  rows?: number;
  data?: string;
}

export function attachTerminalWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    const terminals = new Map<number, pty.IPty>();

    ws.on('message', (raw: WebSocket.RawData) => {
      let msg: TerminalMessage;
      try {
        msg = JSON.parse(raw.toString());
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

          let shell: pty.IPty;
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
            console.error(`PTY spawn failed for Q${qId}:`, (err as Error).message);
            ws.send(JSON.stringify({ type: 'error', questionId: qId, message: (err as Error).message }));
            return;
          }

          shell.onData((data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'output', questionId: qId, data }));
            }
          });

          shell.onExit(() => {
            terminals.delete(qId);
          });

          terminals.set(qId, shell);
          ws.send(JSON.stringify({ type: 'created', questionId: qId }));
          break;
        }

        case 'input': {
          const term = terminals.get(qId);
          if (term && msg.data) {
            recordTerminalInput(String(qId), msg.data);
            term.write(msg.data);
          }
          break;
        }

        case 'resize': {
          const term = terminals.get(qId);
          if (term && msg.cols && msg.rows) {
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
