const fs = require('fs');
const path = require('path');
const { terminalInputBuffers, SANDBOX_DIR } = require('../sandbox/reset');

const SKIP_HISTORY_COMMANDS = new Set(['', 'clear', 'history', 'history -a']);

function historyFileForQuestion(qId) {
  return path.join(SANDBOX_DIR, `.bash_history_q${qId}`);
}

function appendCommandLine(qId, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || SKIP_HISTORY_COMMANDS.has(trimmed)) return;
  fs.appendFileSync(historyFileForQuestion(String(qId)), `${trimmed}\n`, 'utf-8');
}

function recordTerminalInput(qId, data) {
  let buf = terminalInputBuffers.get(qId) ?? '';
  let i = 0;

  while (i < data.length) {
    const ch = data[i];

    if (ch === '\x1b') {
      i++;
      if (data[i] === '[') {
        i++;
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) i++;
      } else if (data[i] === 'O') {
        i++;
      }
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      appendCommandLine(qId, buf);
      buf = '';
      i++;
      continue;
    }

    if (ch === '\u007f' || ch === '\b') {
      buf = buf.slice(0, -1);
      i++;
      continue;
    }

    if (ch === '\u0003' || ch === '\u0015') {
      buf = '';
      i++;
      continue;
    }

    if (ch.charCodeAt(0) >= 32 || ch === '\t') {
      buf += ch;
    }
    i++;
  }

  terminalInputBuffers.set(qId, buf);
}

module.exports = { recordTerminalInput };
