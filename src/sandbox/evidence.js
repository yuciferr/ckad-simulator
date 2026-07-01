const fs = require('fs');
const path = require('path');
const { SANDBOX_DIR } = require('../config');

function collectEvidence() {
  const evidence = {
    commands: {},
    applied: {},
    files: {},
  };

  for (const f of fs.readdirSync(SANDBOX_DIR)) {
    const m = f.match(/^\.bash_history_q(\d+)$/);
    if (!m) continue;
    const raw = fs.readFileSync(path.join(SANDBOX_DIR, f), 'utf-8');
    evidence.commands[m[1]] = raw.split('\n').filter(Boolean);
  }

  const appliedDir = path.join(SANDBOX_DIR, 'etc', 'kubernetes', 'applied');
  if (fs.existsSync(appliedDir)) {
    for (const f of fs.readdirSync(appliedDir)) {
      try {
        evidence.applied[f] = fs.readFileSync(path.join(appliedDir, f), 'utf-8');
      } catch { /* skip binary */ }
    }
  }

  const courseDir = path.join(SANDBOX_DIR, 'opt', 'course');
  if (fs.existsSync(courseDir)) {
    const walk = (dir, base) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = path.join(base, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, rel); continue; }
        if (stat.size > 200_000) continue;
        try { evidence.files[rel] = fs.readFileSync(full, 'utf-8'); } catch { /* binary */ }
      }
    };
    walk(courseDir, 'opt/course');
  }

  return evidence;
}

module.exports = { collectEvidence };
