import { state } from './state.js';
import { $, $$, capitalize } from './utils.js';

export function showScreen(name: string): void {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${name}`).classList.add('active');
  state.currentScreen = name;
  document.body.classList.toggle('landing-open', name === 'landing');
}

/**
 * Screen-independent loading overlay. Unlike per-screen banners, this is
 * visible immediately on click regardless of which `.screen` is active —
 * fixes the "frozen UI" feel while the backend prepares the cluster.
 */
export function showGlobalLoading(text: string): void {
  const overlay = $('#globalLoadingOverlay');
  const textEl = $('#globalLoadingText');
  if (textEl) textEl.textContent = text;
  overlay.classList.remove('hidden');
}

export function updateGlobalLoading(text: string): void {
  const textEl = document.getElementById('globalLoadingText');
  if (textEl) textEl.textContent = text;
}

export function hideGlobalLoading(): void {
  $('#globalLoadingOverlay').classList.add('hidden');
}

export function initResizer(onResize: () => void): void {
  const resizer = $('#resizer');
  const panelLeft = $('#panelLeft');
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e: MouseEvent) => {
    startX = e.clientX;
    startWidth = panelLeft.offsetWidth;
    resizer.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  });

  function onMouseMove(e: MouseEvent) {
    const newWidth = startWidth + (e.clientX - startX);
    const min = 250;
    const max = window.innerWidth - 400;
    panelLeft.style.width = Math.max(min, Math.min(max, newWidth)) + 'px';
    onResize();
  }

  function stopResize() {
    resizer.classList.remove('active');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
    onResize();
  }
}

export function initPanelTabs(): void {
  $$('.panel-left .panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.panel-left .panel-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = (tab as HTMLElement).dataset.tab;
      $$('.panel-left .tab-content').forEach((tc) => {
        tc.classList.toggle('active', tc.id === `tab${capitalize(target ?? '')}`);
      });
    });
  });
}

export function toggleDropdown(id: string): void {
  $(`#${id}`).classList.toggle('open');
}

export function hideModal(): void {
  $('#modalOverlay').classList.remove('open');
}

export function showModal(title: string, body: string): void {
  $('#modalTitle').textContent = title;
  $('#modalBody').textContent = body;
  $('#modalOverlay').classList.add('open');
}

export function closeDropdowns(): void {
  $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
}

export function updateDropdownHighlight(dropdownId: string): void {
  $(`#${dropdownId}`)
    .querySelectorAll('.dropdown-item')
    .forEach((item, i) => {
      item.classList.toggle('active', i === state.currentQuestion);
    });
}
