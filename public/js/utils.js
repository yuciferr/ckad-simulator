import { showCopyToast as toastCopy } from './toast.js';
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);
export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
export function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function pad(n) {
    return String(n).padStart(2, '0');
}
export function attachCopyHandlers(container) {
    container.querySelectorAll('code').forEach((el) => {
        const codeEl = el;
        codeEl.style.cursor = 'pointer';
        codeEl.title = 'Click to copy';
        codeEl.addEventListener('click', async () => {
            const text = codeEl.textContent ?? '';
            try {
                await navigator.clipboard.writeText(text);
            }
            catch {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            toastCopy(text);
        });
    });
}
