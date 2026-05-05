#!/bin/bash
set -e

echo "Seeding database from test/db JSON files..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v events="$(cat /testdata/events.json)" \
  -v users="$(cat /testdata/users.json)" \
  -v invitees="$(cat /testdata/invitees.json)" \
  -v invitations="$(cat /testdata/invitations.json)" \
  -v user_events="$(cat /testdata/user-events.json)" \
  -v sessions="$(cat /testdata/sessions.json)" \
  -v rooms="$(cat /testdata/rooms.json)" \
  <<'EOSQL'

INSERT INTO events (id, name, description, date, submission_restricted, min_stars, max_stars, default_discussion_duration, default_workshop_duration)
SELECT id, name, description, date,
  COALESCE("submissionRestricted", false),
  COALESCE("minStars", 4),
  COALESCE("maxStars", 6),
  COALESCE("defaultDiscussionDuration", 30),
  COALESCE("defaultWorkshopDuration", 75)
FROM json_to_recordset(:'events'::json)
  AS x(id uuid, name varchar, description text, date timestamp, "submissionRestricted" boolean, "minStars" integer, "maxStars" integer, "defaultDiscussionDuration" integer, "defaultWorkshopDuration" integer);

INSERT INTO users (id, github_id, login, first_name, last_name, email, password_hash, avatar_url)
SELECT id, "githubId", login, "firstName", "lastName", email, "passwordHash", "avatarUrl"
FROM json_to_recordset(:'users'::json)
  AS x(id uuid, "githubId" int, login varchar, "firstName" varchar, "lastName" varchar, email varchar, "passwordHash" text, "avatarUrl" text);

INSERT INTO invitees (id, event_id, first_name, last_name, email, role)
SELECT id, "eventId", "firstName", "lastName", email, COALESCE(role, 'participant')::invitee_role
FROM json_to_recordset(:'invitees'::json)
  AS x(id uuid, "eventId" uuid, "firstName" varchar, "lastName" varchar, email varchar, role varchar);

INSERT INTO invitations (id, invitee_id, token, expires_at, used_at)
SELECT COALESCE(id, gen_random_uuid()), "inviteeId", token, "expiresAt", "usedAt"
FROM json_to_recordset(:'invitations'::json)
  AS x(id uuid, "inviteeId" uuid, token uuid, "expiresAt" timestamp, "usedAt" timestamp);

INSERT INTO user_events (user_id, event_id)
SELECT "userId", "eventId"
FROM json_to_recordset(:'user_events'::json)
  AS x("userId" uuid, "eventId" uuid);

INSERT INTO sessions (id, event_id, author_id, title, description, tags, status, type)
SELECT id, "eventId", "authorId", title, description,
  ARRAY(SELECT json_array_elements_text(tags::json))::text[],
  status::session_status,
  COALESCE(type, 'discussion')::session_type
FROM json_to_recordset(:'sessions'::json)
  AS x(id uuid, "eventId" uuid, "authorId" uuid, title varchar, description text, tags text, status varchar, type varchar);

INSERT INTO rooms (id, event_id, name, description, max_capacity, type)
SELECT id, "eventId", name, description, "maxCapacity", type::room_type
FROM json_to_recordset(:'rooms'::json)
  AS x(id uuid, "eventId" uuid, name varchar, description text, "maxCapacity" integer, type varchar);

EOSQL

echo "Seeding complete!"
