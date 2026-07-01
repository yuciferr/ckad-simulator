const { createApp } = require('./src/create-app');
const { PORT, HOST } = require('./src/config');

const { server } = createApp();

server.listen(PORT, HOST, () => {
  console.log(`\n  CKAD Simulator running at http://${HOST}:${PORT}\n`);
});
