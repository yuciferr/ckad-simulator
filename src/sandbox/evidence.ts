import fs from 'fs';
import path from 'path';
import { COURSE_DIR, SANDBOX_DIR } from '../config';

export interface Evidence {
  commands: Record<string, string[]>;
  /** @deprecated Simulation-era applied YAML; kept empty in kind mode for scoring compat. */
  applied: Record<string, string>;
  files: Record<string, string>;
}

export function collectEvidence(): Evidence {
  const evidence: Evidence = {
    commands: {},
    applied: {},
    files: {},
  };

  if (fs.existsSync(SANDBOX_DIR)) {
    for (const f of fs.readdirSync(SANDBOX_DIR)) {
      const m = f.match(/^\.bash_history_q(\d+)$/);
      if (!m) continue;
      const raw = fs.readFileSync(path.join(SANDBOX_DIR, f), 'utf-8');
      evidence.commands[m[1]] = raw.split('\n').filter(Boolean);
    }
  }

  if (fs.existsSync(COURSE_DIR)) {
    const walk = (dir: string, relPrefix: string) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = path.join(relPrefix, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, rel);
          continue;
        }
        if (stat.size > 200_000) continue;
        try {
          evidence.files[rel] = fs.readFileSync(full, 'utf-8');
        } catch {
          /* skip binary */
        }
      }
    };
    walk(COURSE_DIR, 'opt/course');
  }

  return evidence;
}
