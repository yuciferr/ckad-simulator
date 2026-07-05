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
import { WRITABLE_COURSE_DIR } from '../sandbox/course';
import {
  ensureQuestionScenario,
  initialNamespaceForQuestion,
  type ScenarioPhase,
} from '../sandbox/scenario';
import { getCurrentExamId, terminalInputBuffers } from '../sandbox/reset';
import { recordTerminalInput } from '../terminal/capture';

interface TerminalMessage {
  type: string;
  questionId: number;
  cols?: number;
  rows?: number;
  data?: string;
}

function sendScenarioStatus(
  ws: WebSocket,
  questionId: number,
  phase: ScenarioPhase,
  message?: string
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'scenarioStatus', questionId, phase, message }));
}

function buildKindEnv(qId: number, examId: string | null): Record<string, string> {
  const systemPath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
  const ns = initialNamespaceForQuestion(examId, qId);

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
    INITIAL_NAMESPACE: ns,
    COURSE_DIR: WRITABLE_COURSE_DIR,
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
          const examId = getCurrentExamId();

          try {
            const shell = pty.spawn(SHELL, ['--rcfile', CKAD_BASHRC], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd: SANDBOX_DIR,
              env: buildKindEnv(qId, examId),
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

            if (SANDBOX_MODE === 'kind' && examId) {
              void ensureQuestionScenario(examId, qId, (phase, message) => {
                sendScenarioStatus(ws, qId, phase, message);
              }).catch((err) => {
                console.error(`Scenario apply failed for Q${qId}:`, (err as Error).message);
                sendScenarioStatus(ws, qId, 'error', (err as Error).message);
              });
            }
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
