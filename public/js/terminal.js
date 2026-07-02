import { state } from './state.js';
import { $ } from './utils.js';
function scenarioLabel(phase, message) {
    if (message)
        return message;
    switch (phase) {
        case 'deleting':
            return 'Resetting question namespace…';
        case 'applying':
            return 'Applying scenario manifests…';
        case 'waiting':
            return 'Waiting for pods to become Ready…';
        case 'ready':
            return 'Cluster ready';
        case 'error':
            return 'Scenario setup failed';
        default:
            return 'Preparing cluster environment…';
    }
}
function setScenarioOverlay(questionId, visible, text) {
    const wrapper = state.terminalWrappers.get(questionId);
    if (!wrapper)
        return;
    let overlay = wrapper.querySelector('.scenario-overlay');
    if (!visible) {
        overlay?.remove();
        return;
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'scenario-overlay';
        wrapper.appendChild(overlay);
    }
    overlay.textContent = text || 'Preparing cluster environment…';
}
function handleScenarioStatus(msg) {
    if (msg.questionId === undefined)
        return;
    if (msg.phase === 'ready') {
        setScenarioOverlay(msg.questionId, false);
        return;
    }
    if (msg.phase === 'error') {
        setScenarioOverlay(msg.questionId, true, msg.message || 'Scenario setup failed');
        return;
    }
    setScenarioOverlay(msg.questionId, true, scenarioLabel(msg.phase, msg.message));
}
export function connectWebSocket() {
    if (state.ws) {
        state.ws.close();
        destroyAllTerminals();
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    state.ws = new WebSocket(`${proto}//${location.host}/ws`);
    state.ws.addEventListener('open', () => {
        ensureTerminal(state.currentQuestion);
    });
    state.ws.addEventListener('message', (e) => {
        let msg;
        try {
            msg = JSON.parse(e.data);
        }
        catch {
            return;
        }
        if (msg.type === 'output' && msg.questionId !== undefined) {
            const entry = state.terminals.get(msg.questionId);
            if (entry)
                entry.terminal.write(msg.data ?? '');
        }
        else if (msg.type === 'scenarioStatus') {
            handleScenarioStatus(msg);
        }
        else if (msg.type === 'created' && msg.questionId !== undefined) {
            setScenarioOverlay(msg.questionId, true, 'Preparing cluster environment…');
        }
        else if (msg.type === 'error' && msg.questionId !== undefined) {
            console.error(`Terminal error Q${msg.questionId}:`, msg.message);
            const entry = state.terminals.get(msg.questionId);
            if (entry)
                entry.terminal.write(`\r\n\x1b[31mTerminal error: ${msg.message}\x1b[0m\r\n`);
        }
    });
    state.ws.addEventListener('close', () => {
        setTimeout(() => {
            if (state.currentScreen === 'exam')
                connectWebSocket();
        }, 2000);
    });
    state.ws.addEventListener('error', () => {
        console.error('WebSocket connection error');
    });
}
export function ensureTerminal(questionId) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN)
        return;
    if (state.terminals.has(questionId)) {
        showTerminal(questionId);
        return;
    }
    const container = $('#terminalContainer');
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    wrapper.id = `term-${questionId}`;
    container.appendChild(wrapper);
    state.terminalWrappers.forEach((w) => w.classList.remove('active'));
    wrapper.classList.add('active');
    state.terminalWrappers.set(questionId, wrapper);
    const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'Menlo', 'Courier New', monospace",
        theme: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            cursor: '#58a6ff',
            selectionBackground: '#264f78',
        },
        allowProposedApi: true,
    });
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(wrapper);
    setTimeout(() => {
        fitAddon.fit();
        const cols = terminal.cols || 80;
        const rows = terminal.rows || 24;
        wsSend({ type: 'create', questionId, cols, rows });
        terminal.focus();
    }, 50);
    terminal.onData((data) => {
        wsSend({ type: 'input', questionId, data });
    });
    terminal.onResize(({ cols, rows }) => {
        wsSend({ type: 'resize', questionId, cols, rows });
    });
    state.terminals.set(questionId, { terminal, fitAddon });
    wrapper.addEventListener('click', () => terminal.focus());
}
export function showTerminal(questionId) {
    state.terminalWrappers.forEach((w) => w.classList.remove('active'));
    const wrapper = state.terminalWrappers.get(questionId);
    if (wrapper) {
        wrapper.classList.add('active');
        const entry = state.terminals.get(questionId);
        if (entry) {
            requestAnimationFrame(() => {
                entry.fitAddon.fit();
                entry.terminal.focus();
            });
        }
    }
}
export function fitActiveTerminal() {
    const qId = state.currentQuestion;
    const entry = state.terminals.get(qId);
    if (entry) {
        try {
            entry.fitAddon.fit();
        }
        catch { /* ignore */ }
    }
}
export function destroyAllTerminals() {
    state.terminals.forEach(({ terminal }) => {
        try {
            terminal.dispose();
        }
        catch { /* ignore */ }
    });
    state.terminals.clear();
    state.terminalWrappers.forEach((w) => w.remove());
    state.terminalWrappers.clear();
}
export function wsSend(msg) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(msg));
    }
}
export function closeWebSocket() {
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
}
