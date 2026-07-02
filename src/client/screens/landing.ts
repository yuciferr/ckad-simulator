import { $ } from '../utils.js';
import { fetchExams } from '../api.js';
import { loadSavedSession, renderResumeBanner } from '../session-persistence.js';
import { getModuleStats, renderProgressBar } from '../practice-progress.js';
import type { ExamListItem } from '../types.js';

export function renderExamCard(e: ExamListItem): string {
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

function renderExamSection(title: string, description: string, exams: ExamListItem[]): string {
  if (exams.length === 0) return '';
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

export async function loadExamList(onStartExam: (examId: string, saved?: import('../types.js').SavedSession | null) => Promise<void>): Promise<void> {
  try {
    const exams = await fetchExams();
    const container = $('#landingContent');

    if (exams.length === 0) {
      container.innerHTML = '<div class="loading">No exams found. Add exam JSON to the /exams directory.</div>';
      return;
    }

    const mockExams = exams.filter((e) => e.group === 'mock');
    const practiceExams = exams.filter((e) => e.group !== 'mock');

    container.innerHTML =
      renderExamSection(
        'Mock Exams',
        'Full timed simulations with pre-seeded cluster resources',
        mockExams
      ) +
      renderExamSection(
        'Practice Modules',
        'Topic drills — clean cluster, create your own resources',
        practiceExams
      );

    container.querySelectorAll('.exam-card').forEach((card) => {
      card.addEventListener('click', () => {
        const examId = (card as HTMLElement).dataset.examId;
        if (examId) void onStartExam(examId);
      });
    });

    showResumeOption(onStartExam);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    $('#landingContent').innerHTML = `<div class="loading">Error loading exams: ${message}</div>`;
  }
}

function showResumeOption(onStartExam: (examId: string, saved?: import('../types.js').SavedSession | null) => Promise<void>): void {
  const saved = loadSavedSession();
  if (!saved) return;

  renderResumeBanner(
    $('#landingContent'),
    saved,
    () => void onStartExam(saved.examId, saved),
    () => {
      const banner = document.getElementById('resumeBanner');
      if (banner) banner.remove();
    }
  );
}
