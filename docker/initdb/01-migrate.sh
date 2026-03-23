#!/bin/bash
set -e

for f in /drizzle/*.sql; do
  [ -f "$f" ] || continue
  echo "Applying migration: $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
