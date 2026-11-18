const { createApp } = require('./app');
const config = require('./config');
const { closePool } = require('./db');

const app = createApp();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`${config.service} listening on port ${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, closing ${config.service}`);
  server.close(() => {
    closePool()
      .catch((err) => {
        console.error('database pool close failed', err.code || err.message);
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
