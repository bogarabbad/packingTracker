require('dotenv').config();

const port = Number(process.env.PORT) || 3000;

module.exports = {
  port,
  service: 'packing-tracker',
  db: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'packing_tracker',
    user: process.env.PGUSER || 'packing',
    password: process.env.PGPASSWORD || '',
  },
};
