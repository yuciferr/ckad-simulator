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
            showCopyToast(text);
        });
    });
}
export function showCopyToast(text) {
    const existing = document.getElementById('copyToast');
    if (existing)
        existing.remove();
    const toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.textContent = `Copied: ${text.length > 30 ? `${text.slice(0, 30)}…` : text}`;
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #238636;
    color: #fff;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px;
    font-family: monospace;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: fadeInUp 0.15s ease;
  `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}
