import path from 'path';
import * as pty from 'node-pty';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import {
  CKAD_BASHRC,
  KUBECONFIG_PATH,
  SANDBOX_DIR,
  SANDBOX_MODE,
  SHELL,
} from '../config';
import { ensureQuestionScenario, questionNamespace } from '../sandbox/scenario';
import { getCurrentExamId, terminalInputBuffers } from '../sandbox/reset';
import { recordTerminalInput } from '../terminal/capture';

interface TerminalMessage {
  type: string;
  questionId: number;
  cols?: number;
  rows?: number;
  data?: string;
}

function buildKindEnv(qId: number): Record<string, string> {
  const systemPath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';

  return {
    TERM: 'xterm-256color',
    HOME: SANDBOX_DIR,
    PATH: systemPath,
    USER: 'student',
    SHELL: '/bin/bash',
    LANG: process.env.LANG || 'en_US.UTF-8',
    CKAD_QUESTION: String(qId),
    EDITOR: 'vim',
    KUBE_EDITOR: 'vim',
    KUBECONFIG: KUBECONFIG_PATH,
    INITIAL_NAMESPACE: questionNamespace(qId),
    BASH_SILENCE_DEPRECATION_WARNING: '1',
  };
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

          void (async () => {
            try {
              if (SANDBOX_MODE === 'kind') {
                const examId = getCurrentExamId();
                if (examId) {
                  await ensureQuestionScenario(examId, qId);
                }
              }

              const shell = pty.spawn(SHELL, ['--rcfile', CKAD_BASHRC], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: SANDBOX_DIR,
                env: buildKindEnv(qId),
              });

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
            } catch (err) {
              console.error(`PTY setup failed for Q${qId}:`, (err as Error).message);
              ws.send(
                JSON.stringify({
                  type: 'error',
                  questionId: qId,
                  message: (err as Error).message,
                })
              );
            }
          })();
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
            } catch {
              /* ignore */
            }
          }
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      for (const [, shell] of terminals) {
        try {
          shell.kill();
        } catch {
          /* ignore */
        }
      }
      terminals.clear();
    });
  });
}
