import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Auth and DB routes will fail.');
}

// Set DATABASE_SSL=true if your host requires TLS (e.g. Neon, Supabase) and the URL has no sslmode.
const pool = new Pool({
  connectionString,
  ...(process.env.DATABASE_SSL === 'true'
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
