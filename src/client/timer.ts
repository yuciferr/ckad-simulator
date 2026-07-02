import { state } from './state.js';
import { $, pad } from './utils.js';

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
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const display = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  const el = $('#timer');
  el.textContent = display;
  el.classList.remove('warning', 'critical');
  if (s <= 300) el.classList.add('critical');
  else if (s <= 900) el.classList.add('warning');
}
