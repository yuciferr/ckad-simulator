import { showCopyToast as toastCopy } from './toast.js';

export const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;
export const $$ = (sel: string): NodeListOf<Element> => document.querySelectorAll(sel);

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function attachCopyHandlers(container: ParentNode): void {
  container.querySelectorAll('code').forEach((el) => {
    const codeEl = el as HTMLElement;
    codeEl.style.cursor = 'pointer';
    codeEl.title = 'Click to copy';
    codeEl.addEventListener('click', async () => {
      const text = codeEl.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
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
