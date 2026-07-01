function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    meta[key] = val;
  }
  return meta;
}

function parseQuestions(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Question \d+)/);
  const questions = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Question (\d+)\s*\|\s*(.+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const lines = trimmed.split('\n').slice(1);

    let weight = 0;
    let context = '';
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('weight:')) {
        weight = parseInt(line.replace('weight:', '').trim(), 10);
        bodyStart = i + 1;
      } else if (line.startsWith('context:')) {
        context = line.replace('context:', '').trim().replace(/`/g, '');
        bodyStart = i + 1;
      } else if (line !== '') {
        bodyStart = i;
        break;
      }
    }

    const questionBody = lines.slice(bodyStart).join('\n').trim();
    questions.push({ number, title, weight, context, body: questionBody });
  }

  return questions;
}

function parseAnswers(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const sections = body.split(/\n(?=# Answer \d+)/);
  const answers = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^# Answer (\d+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const answerBody = trimmed.split('\n').slice(1).join('\n').trim();

    const criteria = [];
    const criteriaPattern = /- \[ \] (.+)/g;
    let m;
    while ((m = criteriaPattern.exec(answerBody)) !== null) {
      criteria.push(m[1]);
    }

    answers.push({ number, body: answerBody, criteria });
  }

  return answers;
}

function examFromMarkdown(content, meta = {}) {
  const frontmatter = parseFrontmatter(content);
  return {
    title: frontmatter.title || meta.title || 'Untitled Exam',
    duration: parseInt(frontmatter.duration, 10) || 120,
    passPercentage: parseInt(frontmatter.pass_percentage, 10) || 66,
    questions: parseQuestions(content),
  };
}

function answersFromMarkdown(content) {
  return { answers: parseAnswers(content) };
}

function extractNamespacesFromText(text) {
  const namespaces = new Set();
  const patterns = [
    /Namespace [`']([^'`]+)[`']/gi,
    /namespace [`']([^'`]+)[`']/gi,
    /in Namespace [`']([^'`]+)[`']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) namespaces.add(m[1]);
  }
  return [...namespaces];
}

module.exports = {
  parseFrontmatter,
  parseQuestions,
  parseAnswers,
  examFromMarkdown,
  answersFromMarkdown,
  extractNamespacesFromText,
};
