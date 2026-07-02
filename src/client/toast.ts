type ToastKind = 'success' | 'error' | 'info';

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
  }
  return container;
}

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 2800): void {
  const root = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));

  window.setTimeout(() => {
    el.classList.remove('visible');
    window.setTimeout(() => el.remove(), 300);
  }, durationMs);
}

export function showCopyToast(text: string): void {
  const preview = text.length > 36 ? `${text.slice(0, 36)}…` : text;
  showToast(`Copied: ${preview}`, 'success', 1800);
}
