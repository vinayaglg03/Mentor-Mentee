import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

// Set DATABASE_SSL=true if your host requires TLS (e.g. Neon, Supabase) and the URL has no sslmode.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ...(config.databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
