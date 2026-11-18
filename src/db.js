const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('unexpected database client error', err.code || err.message);
});

async function checkConnection() {
  const client = await pool.connect();

  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  checkConnection,
  closePool,
};
