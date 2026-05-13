#!/bin/sh
set -e

echo "Running database migrations..."
RETRIES=10
until node /app/server/database/migrate.mjs; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: migrations failed after all retries — aborting."
    exit 1
  fi
  echo "Migration attempt failed, retrying in 5s... ($RETRIES retries left)"
  sleep 5
done

echo "Starting Nuxt application..."
exec node /app/.output/server/index.mjs
