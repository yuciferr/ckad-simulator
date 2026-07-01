import fs from 'fs';
import path from 'path';
import { SANDBOX_DIR } from '../config';

export interface Evidence {
  commands: Record<string, string[]>;
  applied: Record<string, string>;
  files: Record<string, string>;
}

export function collectEvidence(): Evidence {
  const evidence: Evidence = {
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
    const walk = (dir: string, base: string) => {
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
