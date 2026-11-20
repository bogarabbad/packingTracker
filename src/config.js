require('dotenv').config();

const port = Number(process.env.PORT) || 3000;
const jwtExpiresInSeconds = Number(process.env.JWT_EXPIRES_IN) || 28800;
const jwtSecret = process.env.JWT_SECRET || '';

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}

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
  jwt: {
    secret: jwtSecret,
    expiresIn: jwtExpiresInSeconds,
    expiresInSeconds: jwtExpiresInSeconds,
    issuer: process.env.JWT_ISSUER || 'packing-tracker',
    audience: process.env.JWT_AUDIENCE || 'packing-tracker-api',
  },
};
