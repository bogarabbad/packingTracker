const express = require('express');
const config = require('../config');
const { checkConnection } = require('../db');

const router = express.Router();

router.get('/health', async (req, res) => {
  const checks = {
    api: { status: 'ok' },
    database: { status: 'ok' },
  };

  try {
    await checkConnection();
  } catch (err) {
    console.error('database health check failed', err.code || err.message);
    checks.database.status = 'error';
  }

  const healthy = checks.database.status === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: config.service,
    checks,
  });
});

module.exports = router;
