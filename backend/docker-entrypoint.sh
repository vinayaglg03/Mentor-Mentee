#!/bin/sh
# Applies any pending migrations before the API starts taking requests, so a
# container is never serving against a schema it does not expect.
set -e

echo "Waiting for the database..."
attempt=0
until node -e "
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect().then(() => client.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "The database did not become reachable after 30 attempts. Check DATABASE_URL and that the postgres container is running."
    exit 1
  fi
  sleep 2
done

echo "Applying migrations..."
npx prisma migrate deploy

echo "Starting AMIS..."
exec "$@"
