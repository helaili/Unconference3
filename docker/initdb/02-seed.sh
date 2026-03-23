#!/bin/bash
set -e

echo "Seeding database from test/db JSON files..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v events="$(cat /testdata/events.json)" \
  -v users="$(cat /testdata/users.json)" \
  -v invitees="$(cat /testdata/invitees.json)" \
  -v invitations="$(cat /testdata/invitations.json)" \
  -v user_events="$(cat /testdata/user-events.json)" \
  <<'EOSQL'

INSERT INTO events (id, name, description, date)
SELECT id, name, description, date
FROM json_to_recordset(:'events'::json)
  AS x(id uuid, name varchar, description text, date timestamp);

INSERT INTO users (id, github_id, login, first_name, last_name, email, avatar_url)
SELECT id, "githubId", login, "firstName", "lastName", email, "avatarUrl"
FROM json_to_recordset(:'users'::json)
  AS x(id uuid, "githubId" int, login varchar, "firstName" varchar, "lastName" varchar, email varchar, "avatarUrl" text);

INSERT INTO invitees (id, event_id, first_name, last_name, email)
SELECT id, "eventId", "firstName", "lastName", email
FROM json_to_recordset(:'invitees'::json)
  AS x(id uuid, "eventId" uuid, "firstName" varchar, "lastName" varchar, email varchar);

INSERT INTO invitations (invitee_id, token, expires_at)
SELECT "inviteeId", token, "expiresAt"
FROM json_to_recordset(:'invitations'::json)
  AS x("inviteeId" uuid, token uuid, "expiresAt" timestamp);

INSERT INTO user_events (user_id, event_id)
SELECT "userId", "eventId"
FROM json_to_recordset(:'user_events'::json)
  AS x("userId" uuid, "eventId" uuid);

EOSQL

echo "Seeding complete!"
