const { discoverExams, examSortKey, getExamPayload, getAnswersPayload } = require('../exam/registry');

function createExamRoutes(app) {
  app.get('/api/exams', (_req, res) => {
    try {
      const exams = discoverExams().sort((a, b) => examSortKey(a).localeCompare(examSortKey(b)));
      res.json(exams);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/exams/:id', (req, res) => {
    try {
      const payload = getExamPayload(req.params.id);
      if (!payload) return res.status(404).json({ error: 'Exam not found' });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/exams/:id/answers', (req, res) => {
    try {
      const answers = getAnswersPayload(req.params.id);
      if (!answers) return res.status(404).json({ error: 'Answers not found' });
      res.json(answers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { createExamRoutes };
