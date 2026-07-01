const { resetSandboxState } = require('../sandbox/reset');
const { collectEvidence } = require('../sandbox/evidence');

function createSessionRoutes(app) {
  app.post('/api/sandbox/reset', (req, res) => {
    try {
      resetSandboxState(req.body?.examId ?? null);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/session/evidence', (_req, res) => {
    try {
      res.json(collectEvidence());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { createSessionRoutes };
