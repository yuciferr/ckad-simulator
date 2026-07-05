import fs from 'fs';
import path from 'path';
import { EXAMS_DIR, SANDBOX_DIR } from '../config';
import { resolveExamPaths } from '../exam/registry';

export const WRITABLE_COURSE_DIR = path.join(SANDBOX_DIR, 'opt', 'course');
const OPT_COURSE_LINK = '/opt/course';

let activeCourseDir = WRITABLE_COURSE_DIR;

export function getCourseDir(): string {
  return activeCourseDir;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureOptCourseLink(writablePath: string): void {
  try {
    if (fs.existsSync(OPT_COURSE_LINK)) {
      const stat = fs.lstatSync(OPT_COURSE_LINK);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(OPT_COURSE_LINK);
        if (path.resolve(target) === path.resolve(writablePath)) return;
        fs.unlinkSync(OPT_COURSE_LINK);
      } else if (stat.isDirectory()) {
        // Docker read-only mount — shell uses WRITABLE_COURSE_DIR via env instead
        return;
      }
    } else {
      fs.mkdirSync(path.dirname(OPT_COURSE_LINK), { recursive: true });
    }
    fs.symlinkSync(writablePath, OPT_COURSE_LINK);
  } catch {
    /* PTY falls back to COURSE_DIR env in bashrc */
  }
}

/** Copy exam course seeds into writable sandbox workspace. */
export function seedCourseFromExam(examId: string | null): void {
  if (fs.existsSync(WRITABLE_COURSE_DIR)) {
    fs.rmSync(WRITABLE_COURSE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(WRITABLE_COURSE_DIR, { recursive: true });
  activeCourseDir = WRITABLE_COURSE_DIR;

  if (!examId) {
    ensureOptCourseLink(WRITABLE_COURSE_DIR);
    return;
  }

  const paths = resolveExamPaths(String(examId));
  if (!paths) {
    ensureOptCourseLink(WRITABLE_COURSE_DIR);
    return;
  }

  const seedDir = path.join(
    EXAMS_DIR,
    paths.group === 'mock' ? 'mock' : 'practice',
    String(examId),
    'course'
  );

  if (fs.existsSync(seedDir)) {
    copyDirRecursive(seedDir, WRITABLE_COURSE_DIR);
  }

  ensureOptCourseLink(WRITABLE_COURSE_DIR);
}
