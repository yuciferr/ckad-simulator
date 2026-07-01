const { createApp } = require('./dist/create-app');
const { PORT, HOST } = require('./dist/config');
const { runStartupChecks } = require('./dist/startup-checks');
const { registerProcessErrorHandlers } = require('./dist/middleware/errors');

registerProcessErrorHandlers();
runStartupChecks();

const { server } = createApp();

server.listen(PORT, HOST, () => {
  console.log(`\n  CKAD Simulator running at http://${HOST}:${PORT}\n`);
});
