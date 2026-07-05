import { $ } from '../utils.js';
import { fetchExams, waitForClusterReady } from '../api.js';
import { loadSavedSession, renderResumeBanner } from '../session-persistence.js';
import { getModuleStats, renderProgressBar } from '../practice-progress.js';
function renderHero() {
    return `
    <section class="landing-hero">
      <div class="landing-hero-copy">
        <h1>Practice like the real CKAD exam</h1>
        <p>Timed mock exams and topic drills with an embedded terminal, auto-scoring, and instant feedback — all in your browser.</p>
      </div>
      <div class="hero-terminal" aria-hidden="true">
        <div class="hero-terminal-bar"><span></span><span></span><span></span></div>
        <div class="hero-terminal-body">
          <div><span class="prompt">$ </span><span class="cmd">kubectl get pods -n default</span></div>
          <div class="out">NAME                     READY   STATUS    RESTARTS</div>
          <div class="out">nginx-7fb4-9xk2m          1/1     Running   0</div>
          <div><span class="prompt">$ </span><span class="cmd">kubectl scale deploy/nginx --replicas=3</span></div>
          <div class="out">deployment.apps/nginx scaled</div>
        </div>
      </div>
    </section>
  `;
}
function renderSkeleton() {
    return `
    ${renderHero()}
    <div class="skeleton-grid">
      ${Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('')}
    </div>
  `;
}
export function renderExamCard(e) {
    const group = e.group || 'mock';
    const badge = group === 'mock' ? 'Mock Exam' : 'Practice';
    const progressHtml = group === 'practice' && e.questionCount
        ? renderProgressBar(getModuleStats(e.id, e.questionCount))
        : '';
    return `
    <button class="exam-card ${group}" data-exam-id="${e.id}" aria-label="Start ${e.title}">
      <div>
        <div class="exam-card-badge">${badge}</div>
        <div class="exam-card-title">${e.title}</div>
      </div>
      ${progressHtml}
      <div class="exam-card-meta">
        <span>⏱ ${e.duration} min</span>
        <span>📋 ${e.questionCount || '?'} Q</span>
        <span>${e.hasAnswer ? '✅ Answers' : '⚠️ No answers'}</span>
      </div>
    </button>
  `;
}
function renderExamSection(title, description, exams) {
    if (exams.length === 0)
        return '';
    return `
    <section class="exam-section">
      <div class="exam-section-header">
        <div class="exam-section-title">${title}</div>
        <div class="exam-section-desc">${description}</div>
      </div>
      <div class="exam-grid">
        ${exams.map(renderExamCard).join('')}
      </div>
    </section>
  `;
}
export async function loadExamList(onStartExam) {
    const container = $('#landingContent');
    container.innerHTML =
        renderHero() +
            '<div class="cluster-banner" id="clusterBanner">Starting Kubernetes cluster…</div>' +
            renderSkeleton();
    try {
        await waitForClusterReady();
        const banner = document.getElementById('clusterBanner');
        if (banner)
            banner.remove();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        container.innerHTML =
            renderHero() +
                `<div class="cluster-banner cluster-banner--error">Cluster not ready: ${message}. Run <code>make up</code> and refresh.</div>`;
        return;
    }
    try {
        const exams = await fetchExams();
        if (exams.length === 0) {
            container.innerHTML = renderHero() + '<div class="loading">No exams found. Add exam JSON to the /exams directory.</div>';
            return;
        }
        const mockExams = exams.filter((e) => e.group === 'mock');
        const practiceExams = exams.filter((e) => e.group !== 'mock');
        container.innerHTML =
            renderHero() +
                renderExamSection('Mock Exams', 'Full timed simulations with pre-seeded cluster resources', mockExams) +
                renderExamSection('Practice Modules', 'Topic drills — clean cluster, create your own resources', practiceExams);
        container.querySelectorAll('.exam-card').forEach((card) => {
            card.addEventListener('click', () => {
                const examId = card.dataset.examId;
                if (!examId)
                    return;
                card.classList.add('starting');
                void onStartExam(examId);
            });
        });
        showResumeOption(onStartExam);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        container.innerHTML = renderHero() + `<div class="loading">Error loading exams: ${message}</div>`;
    }
}
function showResumeOption(onStartExam) {
    const saved = loadSavedSession();
    if (!saved)
        return;
    renderResumeBanner($('#landingContent'), saved, () => void onStartExam(saved.examId, saved), () => {
        const banner = document.getElementById('resumeBanner');
        if (banner)
            banner.remove();
    });
}
