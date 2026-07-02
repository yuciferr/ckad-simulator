import { state } from './state.js';
import { $, pad } from './utils.js';

const RING_C = 2 * Math.PI * 15.5;

export function stopTimer(): void {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
}

export function startTimer(): void {
  stopTimer();
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      stopTimer();
      if (state.onTimerExpired) state.onTimerExpired();
    }
  }, 1000);
}

export function updateTimerDisplay(): void {
  const s = Math.max(0, state.timerSeconds);
  const total = state.exam ? state.exam.duration * 60 : s || 1;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const el = $('#timer');
  el.textContent = `${pad(h)}:${pad(m)}:${pad(sec)}`;

  const wrap = $('#timerWrap');
  wrap.classList.remove('warning', 'critical');
  el.classList.remove('warning', 'critical');
  if (s <= 300) {
    wrap.classList.add('critical');
    el.classList.add('critical');
  } else if (s <= 900) {
    wrap.classList.add('warning');
    el.classList.add('warning');
  }

  const ring = document.getElementById('timerRingFg');
  if (ring) {
    const ratio = Math.max(0, Math.min(1, s / total));
    ring.setAttribute('stroke-dasharray', RING_C.toFixed(2));
    ring.setAttribute('stroke-dashoffset', (RING_C * (1 - ratio)).toFixed(2));
  }
}
