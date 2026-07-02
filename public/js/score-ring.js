export function renderScoreRing(percent, size = 44) {
    const p = Math.max(0, Math.min(100, percent));
    const r = 15.5;
    const c = 2 * Math.PI * r;
    const offset = c - (p / 100) * c;
    const cls = p >= 66 ? 'pass' : p >= 50 ? 'partial' : 'fail';
    return `
    <svg class="score-ring ${cls}" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="score-ring-bg" cx="18" cy="18" r="${r}" fill="none" stroke-width="3"/>
      <circle class="score-ring-fg" cx="18" cy="18" r="${r}" fill="none" stroke-width="3"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 18 18)"/>
      <text x="18" y="18.5" class="score-ring-text" text-anchor="middle" dominant-baseline="middle">${p}%</text>
    </svg>`;
}
export function updateScoreRing(el, percent) {
    el.innerHTML = renderScoreRing(percent);
}
