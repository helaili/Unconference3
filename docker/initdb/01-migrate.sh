#!/bin/bash
set -e

# Create drizzle tracking schema and migrations table
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
EOSQL

JOURNAL=/drizzle/meta/_journal.json

# Extract tag|when pairs from journal in order (when comes before tag in each entry)
extract_entries() {
  awk '
    /"when"/ { gsub(/.*"when": */, ""); gsub(/[^0-9].*/, ""); when = $0 }
    /"tag"/  { gsub(/.*"tag": *"/, ""); gsub(/".*/, ""); tag = $0
               if (when != "") { print tag "|" when; when = "" } }
  ' "$JOURNAL"
}

while IFS='|' read -r tag when; do
  f="/drizzle/${tag}.sql"
  [ -f "$f" ] || { echo "WARNING: $f not found, skipping"; continue; }

  echo "Applying migration: ${tag}.sql"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"

  hash=$(sha256sum "$f" | awk '{print $1}')
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${when})"
done < <(extract_entries)
