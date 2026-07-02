import type { AppState } from './types.js';

export type AppRoute =
  | { screen: 'landing' }
  | { screen: 'exam'; examId: string; questionIndex: number }
  | { screen: 'review'; examId: string; questionIndex: number; reviewMode: string };

export function parseRoute(pathname: string = location.pathname): AppRoute {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  if (parts.length === 0) return { screen: 'landing' };

  if (parts[0] === 'exam' && parts.length >= 2) {
    const examId = decodeURIComponent(parts[1]);
    if (parts[2] === 'review') {
      const q = parts[4] === 'q' && parts[5] ? Math.max(0, parseInt(parts[5], 10) - 1) : 0;
      return { screen: 'review', examId, questionIndex: Number.isFinite(q) ? q : 0, reviewMode: 'exam' };
    }
    if (parts[2] === 'summary') {
      const q = parts[4] === 'q' && parts[5] ? Math.max(0, parseInt(parts[5], 10) - 1) : 0;
      return { screen: 'review', examId, questionIndex: Number.isFinite(q) ? q : 0, reviewMode: 'practice-summary' };
    }
    if (parts[2] === 'q' && parts[3]) {
      const q = Math.max(0, parseInt(parts[3], 10) - 1);
      return { screen: 'exam', examId, questionIndex: Number.isFinite(q) ? q : 0 };
    }
    return { screen: 'exam', examId, questionIndex: 0 };
  }

  return { screen: 'landing' };
}

export function routeToPath(route: AppRoute): string {
  switch (route.screen) {
    case 'landing':
      return '/';
    case 'exam':
      return route.questionIndex > 0
        ? `/exam/${encodeURIComponent(route.examId)}/q/${route.questionIndex + 1}`
        : `/exam/${encodeURIComponent(route.examId)}`;
    case 'review':
      if (route.reviewMode === 'practice-summary') {
        return route.questionIndex > 0
          ? `/exam/${encodeURIComponent(route.examId)}/summary/q/${route.questionIndex + 1}`
          : `/exam/${encodeURIComponent(route.examId)}/summary`;
      }
      return route.questionIndex > 0
        ? `/exam/${encodeURIComponent(route.examId)}/review/q/${route.questionIndex + 1}`
        : `/exam/${encodeURIComponent(route.examId)}/review`;
  }
}

export function navigateTo(route: AppRoute, replace = false): void {
  const path = routeToPath(route);
  if (location.pathname === path) return;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({ route }, '', path);
}

export function syncRouteFromState(state: AppState): void {
  if (!state.exam) {
    navigateTo({ screen: 'landing' }, true);
    return;
  }

  if (state.currentScreen === 'review') {
    navigateTo(
      {
        screen: 'review',
        examId: state.exam.id,
        questionIndex: state.currentQuestion,
        reviewMode: state.reviewMode,
      },
      true
    );
    return;
  }

  if (state.currentScreen === 'exam') {
    navigateTo(
      {
        screen: 'exam',
        examId: state.exam.id,
        questionIndex: state.currentQuestion,
      },
      true
    );
  }
}
