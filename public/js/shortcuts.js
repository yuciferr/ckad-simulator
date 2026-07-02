import { $ } from './utils.js';
import { showToast } from './toast.js';
let handlers = [];
let overlayOpen = false;
export function registerShortcutHandlers(items) {
    handlers = items;
}
export function initShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA')
                return;
            e.preventDefault();
            toggleShortcutsOverlay();
            return;
        }
        if (overlayOpen && e.key === 'Escape') {
            closeShortcutsOverlay();
            return;
        }
        if (!e.altKey || e.metaKey || e.ctrlKey)
            return;
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA')
            return;
        const match = handlers.find((h) => h.key === e.key.toLowerCase());
        if (match) {
            e.preventDefault();
            match.action();
            showToast(match.label, 'info', 1500);
        }
    });
    $('#btnShortcuts')?.addEventListener('click', () => toggleShortcutsOverlay());
    $('#shortcutsClose')?.addEventListener('click', () => closeShortcutsOverlay());
    $('#shortcutsOverlay')?.addEventListener('click', (e) => {
        if (e.target === $('#shortcutsOverlay'))
            closeShortcutsOverlay();
    });
}
function toggleShortcutsOverlay() {
    overlayOpen = !overlayOpen;
    $('#shortcutsOverlay')?.classList.toggle('open', overlayOpen);
}
function closeShortcutsOverlay() {
    overlayOpen = false;
    $('#shortcutsOverlay')?.classList.remove('open');
}
