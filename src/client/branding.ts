/**
 * Brand assets + shared chrome (header, footer, resource links, docs panel)
 * and the animated hero terminal.
 */

/* ─── Brand images (public/img/) ───────────────────────────────────────────── */

export const IMG = {
  ckad: '/img/ckad-logo1.png',
  k8s: '/img/k8s-logo1.png',
  k8sMark: '/img/k8s-logo2.png',
  cncfTools: '/img/cncf-log2.png',
} as const;

function imgTag(src: string, alt: string, cls: string, size?: number): string {
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<img src="${src}" alt="${alt}" class="${cls}"${dim} loading="lazy">`;
}

/* ─── Inline SVG icons (UI chrome only) ──────────────────────────────────────── */

export const ICON_GITHUB = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

export const ICON_LINKEDIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>`;

export const ICON_EXTERNAL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`;

export const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;

export const ICON_LIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`;

export const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export const ICON_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></svg>`;

/* ─── External resources ───────────────────────────────────────────────────── */

interface LinkDef {
  href: string;
  label: string;
  desc?: string;
}

interface ResourceGroup {
  id: string;
  title: string;
  logo: string;
  logoAlt: string;
  links: LinkDef[];
}

const NAV_LINKS: LinkDef[] = [
  { href: '#mock-exams', label: 'Mock Exams' },
  { href: '#practice-modules', label: 'Practice' },
  { href: '#study-resources', label: 'Resources' },
  { href: 'https://kubernetes.io', label: 'Kubernetes.io' },
  {
    href: 'https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/',
    label: 'CKAD Info',
  },
];

const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    id: 'k8s-core',
    title: 'Kubernetes core',
    logo: IMG.k8sMark,
    logoAlt: 'Kubernetes',
    links: [
      { href: 'https://kubernetes.io/docs/home/', label: 'Documentation', desc: 'Concepts, tasks & tutorials' },
      { href: 'https://kubernetes.io/docs/reference/kubectl/cheatsheet/', label: 'kubectl cheat sheet', desc: 'Commands under time pressure' },
      { href: 'https://kubernetes.io/docs/reference/kubernetes-api/', label: 'API reference', desc: 'Every resource type' },
      {
        href: 'https://kubernetes.io/docs/tasks/configure-application-container/configure-liveness-readiness-startup-probes/',
        label: 'Probes & health checks',
        desc: 'Liveness, readiness, startup',
      },
    ],
  },
  {
    id: 'exam-prep',
    title: 'Exam & curriculum',
    logo: IMG.ckad,
    logoAlt: 'CKAD',
    links: [
      {
        href: 'https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/',
        label: 'CKAD exam info',
        desc: 'Registration, format & policies',
      },
      { href: 'https://github.com/cncf/curriculum', label: 'CNCF curriculum', desc: 'Official exam domains PDF' },
    ],
  },
  {
    id: 'exam-tools',
    title: 'Tools on the exam',
    logo: IMG.cncfTools,
    logoAlt: 'CNCF',
    links: [
      { href: 'https://helm.sh/docs/', label: 'Helm', desc: 'Charts, releases & templating' },
      { href: 'https://docs.podman.io/', label: 'Podman', desc: 'Rootless containers' },
    ],
  },
];

const AUTHOR = {
  github: 'https://github.com/yuciferr',
  linkedin: 'https://www.linkedin.com/in/yucifer/',
  name: 'Yusuf Samed Çelik',
};

function extLink(l: LinkDef, cls = 'nav-link'): string {
  const external = l.href.startsWith('http');
  return `<a class="${cls}" href="${l.href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${l.label}</a>`;
}

function anchorScroll(e: Event): void {
  const a = e.currentTarget as HTMLAnchorElement;
  const hash = a.getAttribute('href');
  if (!hash?.startsWith('#')) return;
  e.preventDefault();
  const target = document.querySelector(hash);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', hash);
  }
}

function renderRefRow(l: LinkDef): string {
  return `
    <a class="ref-row" href="${l.href}" target="_blank" rel="noopener noreferrer">
      <span class="ref-row-label">${l.label}</span>
      <span class="ref-row-desc">${l.desc || ''}</span>
      <span class="ref-row-arrow" aria-hidden="true">${ICON_EXTERNAL}</span>
    </a>`;
}

function renderRefGroup(g: ResourceGroup): string {
  return `
    <div class="ref-column" id="${g.id}">
      <div class="ref-column-head">
        ${imgTag(g.logo, g.logoAlt, 'ref-column-logo', 40)}
        <span class="ref-column-title">${g.title}</span>
      </div>
      <div class="ref-column-links">
        ${g.links.map(renderRefRow).join('')}
      </div>
    </div>`;
}

/* ─── Shared chrome ────────────────────────────────────────────────────────── */

export function renderSiteHeader(): string {
  return `
    <header class="site-header">
      <a class="brand" href="#" id="brandHome" aria-label="Home">
        ${imgTag(IMG.k8sMark, 'Kubernetes', 'brand-k8s-logo', 30)}
        <span class="brand-text"><strong>CKAD</strong> Simulator</span>
      </a>
      <nav class="site-nav" aria-label="Site navigation">
        ${NAV_LINKS.map((l) => extLink(l)).join('')}
        <span class="nav-divider" aria-hidden="true"></span>
        <a class="nav-icon" href="${AUTHOR.github}" target="_blank" rel="noopener noreferrer" title="GitHub — yuciferr" aria-label="GitHub">${ICON_GITHUB}</a>
        <a class="nav-icon" href="${AUTHOR.linkedin}" target="_blank" rel="noopener noreferrer" title="LinkedIn — yucifer" aria-label="LinkedIn">${ICON_LINKEDIN}</a>
      </nav>
    </header>`;
}

export function bindSiteHeader(): void {
  document.getElementById('brandHome')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('landing')?.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', ' ');
  });
  document.querySelectorAll('.site-nav a[href^="#"]').forEach((a) => {
    a.addEventListener('click', anchorScroll);
  });
}

export function renderResourceLinks(): string {
  return `
    <section class="ref-desk" id="study-resources">
      <div class="ref-desk-header">
        <div>
          <h2 class="ref-desk-title">Study resources</h2>
          <p class="ref-desk-sub">Official documentation grouped by what you need during prep</p>
        </div>
      </div>
      <div class="ref-desk-grid">
        ${RESOURCE_GROUPS.map(renderRefGroup).join('')}
      </div>
    </section>`;
}

export function renderSiteFooter(): string {
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          ${imgTag(IMG.k8s, 'Kubernetes', 'footer-k8s-logo', 44)}
          <div>
            <div class="footer-title">CKAD Simulator</div>
            <div class="footer-note">Practice on a real kind cluster. Not affiliated with CNCF or the Linux Foundation.</div>
          </div>
        </div>
        <div class="footer-links">
          <a class="nav-link" href="https://kubernetes.io" target="_blank" rel="noopener noreferrer">Kubernetes.io</a>
          <a class="nav-link" href="https://kubernetes.io/docs/home/" target="_blank" rel="noopener noreferrer">Docs</a>
          <a class="nav-link" href="https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/" target="_blank" rel="noopener noreferrer">CKAD</a>
          <a class="footer-social" href="${AUTHOR.github}" target="_blank" rel="noopener noreferrer" aria-label="GitHub">${ICON_GITHUB}</a>
          <a class="footer-social" href="${AUTHOR.linkedin}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">${ICON_LINKEDIN}</a>
        </div>
      </div>
      <div class="footer-credit">Built by <a href="${AUTHOR.github}" target="_blank" rel="noopener noreferrer">${AUTHOR.name}</a></div>
    </footer>`;
}

export function renderDocsPanel(): string {
  return `
    <div class="docs-panel-head">
      <span>Reference — opens in a new tab</span>
      <a class="docs-open-all" href="https://kubernetes.io/docs/home/" target="_blank" rel="noopener noreferrer">
        ${imgTag(IMG.k8sMark, '', 'docs-head-logo', 18)} kubernetes.io/docs
      </a>
    </div>
    <div class="docs-groups">
      ${RESOURCE_GROUPS.map(
        (g) => `
        <div class="docs-group">
          <div class="docs-group-label">${g.title}</div>
          ${g.links
            .map(
              (l) => `
            <a class="docs-link" href="${l.href}" target="_blank" rel="noopener noreferrer">
              <span class="docs-link-body">
                <span class="docs-link-label">${l.label}</span>
                <span class="docs-link-desc">${l.desc || ''}</span>
              </span>
              <span class="docs-link-ext">${ICON_EXTERNAL}</span>
            </a>`
            )
            .join('')}
        </div>`
      ).join('')}
    </div>`;
}

/* ─── Animated hero terminal ───────────────────────────────────────────────── */

interface TermStep {
  cmd: string;
  out: string[];
}

const HERO_SCRIPT: TermStep[] = [
  {
    cmd: 'kubectl get pods -n default',
    out: [
      'NAME                    READY   STATUS    RESTARTS   AGE',
      'web-6b9f8c4d-2xk7q      1/1     <span class="t-ok">Running</span>   0          2d',
      'api-7c5d9f6b-mn4rt      1/1     <span class="t-ok">Running</span>   0          2d',
    ],
  },
  {
    cmd: 'kubectl run cache --image=redis:7 --restart=Never',
    out: ['<span class="t-created">pod/cache created</span>'],
  },
  {
    cmd: 'kubectl scale deploy/api --replicas=3',
    out: ['<span class="t-created">deployment.apps/api scaled</span>'],
  },
  {
    cmd: 'kubectl expose deploy/api --port=8080 --type=ClusterIP',
    out: ['<span class="t-created">service/api exposed</span>'],
  },
];

let heroTimer: ReturnType<typeof setTimeout> | null = null;
let heroToken = 0;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function startHeroTerminal(el: HTMLElement): void {
  if (heroTimer) clearTimeout(heroTimer);
  const token = ++heroToken;
  const lines: string[] = [];

  const render = (typing?: string) => {
    if (token !== heroToken) return;
    const body = lines
      .map((l) =>
        l.startsWith('$ ')
          ? `<div><span class="prompt">$ </span><span class="cmd">${escapeTerm(l.slice(2))}</span></div>`
          : `<div class="out">${l}</div>`
      )
      .join('');
    const cursor =
      typing !== undefined
        ? `<div><span class="prompt">$ </span><span class="cmd">${escapeTerm(typing)}</span><span class="term-cursor">▋</span></div>`
        : `<div><span class="prompt">$ </span><span class="term-cursor">▋</span></div>`;
    el.innerHTML = body + cursor;
  };

  const wait = (ms: number) => new Promise<void>((r) => (heroTimer = setTimeout(r, ms)));

  const runStep = async (step: TermStep) => {
    for (let i = 1; i <= step.cmd.length; i++) {
      if (token !== heroToken) return;
      render(step.cmd.slice(0, i));
      await wait(32 + Math.random() * 38);
    }
    if (token !== heroToken) return;
    lines.push('$ ' + step.cmd);
    render();
    await wait(280);
    for (const o of step.out) {
      if (token !== heroToken) return;
      lines.push(o);
      render();
      await wait(120);
    }
    await wait(900);
  };

  const loop = async () => {
    if (prefersReducedMotion()) {
      el.innerHTML = HERO_SCRIPT.map(
        (s) =>
          `<div><span class="prompt">$ </span><span class="cmd">${escapeTerm(s.cmd)}</span></div>` +
          s.out.map((o) => `<div class="out">${o}</div>`).join('')
      ).join('');
      return;
    }

    while (token === heroToken) {
      for (const step of HERO_SCRIPT) {
        await runStep(step);
        if (token !== heroToken) return;
      }
      await wait(800);
      lines.length = 0;
      render('');
      await wait(400);
    }
  };

  void loop();
}

function escapeTerm(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
