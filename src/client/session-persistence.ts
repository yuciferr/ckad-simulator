const STORAGE_KEY = 'ckad-exam-session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function serializeSession(state) {
  if (!state.exam) return null;
  return {
    examId: state.exam.id,
    mode: state.mode,
    reviewMode: state.reviewMode,
    currentQuestion: state.currentQuestion,
    currentScreen: state.currentScreen,
    flagged: [...state.flagged],
    timerSeconds: state.timerSeconds,
    reviewScores: state.reviewScores,
    practiceResults: state.practiceResults,
    savedAt: Date.now(),
  };
}

export function saveSession(state) {
  const payload = serializeSession(state);
  if (!payload) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* quota */ }
}

export function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.examId || !data.savedAt) return null;
    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      clearSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function attachPersistenceHooks(state, onPersist) {
  window.addEventListener('beforeunload', () => {
    if (state.exam && state.currentScreen === 'exam') onPersist();
  });
}

export function renderResumeBanner(container, saved, onResume, onDismiss) {
  const existing = document.getElementById('resumeBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'resumeBanner';
  banner.className = 'resume-banner';
  banner.innerHTML = `
    <div class="resume-banner-text">
      <strong>Devam eden oturum:</strong> ${saved.examId}
      <span class="resume-banner-meta">Soru ${saved.currentQuestion + 1} · ${formatSavedAt(saved.savedAt)}</span>
    </div>
    <div class="resume-banner-actions">
      <button type="button" class="nav-btn resume-btn" id="btnResumeSession">Devam Et</button>
      <button type="button" class="nav-btn resume-dismiss" id="btnDismissResume">Kapat</button>
    </div>
  `;

  container.prepend(banner);
  banner.querySelector('#btnResumeSession').addEventListener('click', onResume);
  banner.querySelector('#btnDismissResume').addEventListener('click', () => {
    clearSession();
    onDismiss();
  });
}

function formatSavedAt(ts) {
  const d = new Date(ts);
  return d.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

export function applySavedSession(state, saved) {
  state.mode = saved.mode || 'exam';
  state.reviewMode = saved.reviewMode || 'exam';
  state.currentQuestion = saved.currentQuestion || 0;
  state.flagged = new Set(saved.flagged || []);
  state.timerSeconds = saved.timerSeconds ?? 0;
  state.reviewScores = saved.reviewScores || {};
  state.practiceResults = saved.practiceResults || {};
}
