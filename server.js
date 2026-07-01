const { createApp } = require('./dist/create-app');
const { PORT, HOST } = require('./dist/config');

const { server } = createApp();

server.listen(PORT, HOST, () => {
  console.log(`\n  CKAD Simulator running at http://${HOST}:${PORT}\n`);
});
