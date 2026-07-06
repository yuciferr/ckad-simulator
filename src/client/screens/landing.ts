import { $ } from '../utils.js';
import { fetchExams, waitForClusterReady } from '../api.js';
import { loadSavedSession, renderResumeBanner } from '../session-persistence.js';
import { getModuleStats, renderProgressBar } from '../practice-progress.js';
import {
  renderSiteHeader,
  renderSiteFooter,
  renderResourceLinks,
  startHeroTerminal,
  bindSiteHeader,
  IMG,
  ICON_CLOCK,
  ICON_LIST,
  ICON_CHECK,
  ICON_WARN,
} from '../branding.js';
import type { ExamListItem } from '../types.js';

function renderHero(): string {
  return `
    <section class="landing-hero">
      <div class="landing-hero-copy">
        <div class="hero-brand-row">
          <img src="${IMG.ckad}" alt="Certified Kubernetes Application Developer" class="hero-ckad-logo" width="200" height="200" loading="eager">
          <div class="hero-eyebrow">Certified Kubernetes Application Developer</div>
        </div>
        <h1>Practice like the <span class="hero-accent">real CKAD exam</span></h1>
        <p>Timed mock exams and focused topic drills on a real Kubernetes cluster — embedded terminal, result-based auto-scoring, and instant feedback in your browser.</p>
        <div class="hero-stats">
          <div class="hero-stat"><strong>167</strong><span>graded tasks</span></div>
          <div class="hero-stat"><strong>11</strong><span>modules</span></div>
          <div class="hero-stat"><strong>Real</strong><span>kind cluster</span></div>
        </div>
        <div class="hero-cta-row">
          <a class="hero-cta hero-cta--primary" href="#mock-exams">Start mock exam</a>
          <a class="hero-cta hero-cta--ghost" href="https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/" target="_blank" rel="noopener noreferrer">Official CKAD info</a>
        </div>
      </div>
      <div class="hero-terminal" aria-hidden="true">
        <div class="hero-terminal-bar">
          <span></span><span></span><span></span>
          <em>user@ckad-sim:~</em>
        </div>
        <div class="hero-terminal-body" id="heroTermBody"></div>
      </div>
    </section>
  `;
}

function mountHero(): void {
  const el = document.getElementById('heroTermBody');
  if (el) startHeroTerminal(el);
}

function mountChrome(): void {
  const header = document.getElementById('siteHeader');
  const footer = document.getElementById('siteFooter');
  if (header && !header.dataset.mounted) {
    header.innerHTML = renderSiteHeader();
    header.dataset.mounted = '1';
    bindSiteHeader();
  }
  if (footer && !footer.dataset.mounted) {
    footer.innerHTML = renderSiteFooter();
    footer.dataset.mounted = '1';
  }
}

function renderSkeleton(): string {
  return `
    ${renderHero()}
    <div class="skeleton-grid">
      ${Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('')}
    </div>
  `;
}

export function renderExamCard(e: ExamListItem): string {
  const group = e.group || 'mock';
  const badge = group === 'mock' ? 'Mock Exam' : 'Practice';
  const progressHtml = group === 'practice' && e.questionCount
    ? renderProgressBar(getModuleStats(e.id, e.questionCount))
    : '';
  const answerMeta = e.hasAnswer
    ? `<span class="meta-item meta-ok">${ICON_CHECK} Answers</span>`
    : `<span class="meta-item meta-warn">${ICON_WARN} No answers</span>`;

  return `
    <button class="exam-card ${group}" data-exam-id="${e.id}" aria-label="Start ${e.title}">
      <div>
        <div class="exam-card-badge">${badge}</div>
        <div class="exam-card-title">${e.title}</div>
      </div>
      ${progressHtml}
      <div class="exam-card-meta">
        <span class="meta-item">${ICON_CLOCK} ${e.duration} min</span>
        <span class="meta-item">${ICON_LIST} ${e.questionCount || '?'} Q</span>
        ${answerMeta}
      </div>
    </button>
  `;
}

function renderExamSection(
  id: string,
  title: string,
  description: string,
  exams: ExamListItem[]
): string {
  if (exams.length === 0) return '';
  return `
    <section class="exam-section" id="${id}">
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

export async function loadExamList(onStartExam: (examId: string, saved?: import('../types.js').SavedSession | null) => Promise<void>): Promise<void> {
  mountChrome();
  const container = $('#landingContent');
  container.innerHTML =
    renderHero() +
    '<div class="cluster-banner" id="clusterBanner"><span class="cluster-spinner"></span> Starting Kubernetes cluster…</div>' +
    renderSkeleton();
  mountHero();

  try {
    await waitForClusterReady();
    document.getElementById('clusterBanner')?.remove();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    container.innerHTML =
      renderHero() +
      `<div class="cluster-banner cluster-banner--error">Cluster not ready: ${message}. Run <code>make up</code> and refresh.</div>`;
    mountHero();
    return;
  }

  try {
    const exams = await fetchExams();

    if (exams.length === 0) {
      container.innerHTML = renderHero() + '<div class="loading">No exams found. Add exam JSON to the /exams directory.</div>';
      mountHero();
      return;
    }

    const mockExams = exams.filter((e) => e.group === 'mock');
    const practiceExams = exams.filter((e) => e.group !== 'mock');

    container.innerHTML =
      renderHero() +
      renderExamSection(
        'mock-exams',
        'Mock Exams',
        'Full timed simulations with pre-seeded cluster resources',
        mockExams
      ) +
      renderExamSection(
        'practice-modules',
        'Practice Modules',
        'Topic drills — clean cluster, create your own resources',
        practiceExams
      ) +
      renderResourceLinks();
    mountHero();

    container.querySelectorAll('.exam-card').forEach((card) => {
      card.addEventListener('click', () => {
        const examId = (card as HTMLElement).dataset.examId;
        if (!examId) return;
        card.classList.add('starting');
        void onStartExam(examId);
      });
    });

    container.querySelectorAll('.hero-cta[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const hash = (a as HTMLAnchorElement).getAttribute('href');
        if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    showResumeOption(onStartExam);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    container.innerHTML = renderHero() + `<div class="loading">Error loading exams: ${message}</div>`;
    mountHero();
  }
}

function showResumeOption(onStartExam: (examId: string, saved?: import('../types.js').SavedSession | null) => Promise<void>): void {
  const saved = loadSavedSession();
  if (!saved) return;

  renderResumeBanner(
    $('#landingContent'),
    saved,
    () => void onStartExam(saved.examId, saved),
    () => document.getElementById('resumeBanner')?.remove()
  );
}
