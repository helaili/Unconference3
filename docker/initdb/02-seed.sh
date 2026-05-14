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
  -v session_stars="$(cat /testdata/session-stars.json)" \
  -v rooms="$(cat /testdata/rooms.json)" \
  -v rounds="$(cat /testdata/rounds.json)" \
  -v round_rooms="$(cat /testdata/round-rooms.json)" \
  -v slots="$(cat /testdata/slots.json)" \
  -v slot_registrations="$(cat /testdata/slot-registrations.json)" \
  -v introduction_rounds="$(cat /testdata/introduction-rounds.json)" \
  <<'EOSQL'

INSERT INTO events (id, name, description, date, submission_restricted, min_stars, max_stars, default_discussion_duration, default_workshop_duration)
SELECT id, name, description, date,
  COALESCE("submissionRestricted", false),
  COALESCE("minStars", 4),
  COALESCE("maxStars", 6),
  COALESCE("defaultDiscussionDuration", 30),
  COALESCE("defaultWorkshopDuration", 75)
FROM json_to_recordset(:'events'::json)
  AS x(id uuid, name varchar, description text, date timestamp, "submissionRestricted" boolean, "minStars" integer, "maxStars" integer, "defaultDiscussionDuration" integer, "defaultWorkshopDuration" integer)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, github_id, login, first_name, last_name, email, password_hash, avatar_url)
SELECT id, "githubId", login, "firstName", "lastName", email, "passwordHash", "avatarUrl"
FROM json_to_recordset(:'users'::json)
  AS x(id uuid, "githubId" int, login varchar, "firstName" varchar, "lastName" varchar, email varchar, "passwordHash" text, "avatarUrl" text)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invitees (id, event_id, first_name, last_name, email, role)
SELECT id, "eventId", "firstName", "lastName", email, COALESCE(role, 'participant')::invitee_role
FROM json_to_recordset(:'invitees'::json)
  AS x(id uuid, "eventId" uuid, "firstName" varchar, "lastName" varchar, email varchar, role varchar)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invitations (id, invitee_id, token, expires_at, used_at)
SELECT COALESCE(id, gen_random_uuid()), "inviteeId", token, "expiresAt", "usedAt"
FROM json_to_recordset(:'invitations'::json)
  AS x(id uuid, "inviteeId" uuid, token uuid, "expiresAt" timestamp, "usedAt" timestamp)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_events (user_id, event_id)
SELECT "userId", "eventId"
FROM json_to_recordset(:'user_events'::json)
  AS x("userId" uuid, "eventId" uuid)
ON CONFLICT (user_id, event_id) DO NOTHING;

INSERT INTO sessions (id, event_id, author_id, title, description, tags, status, type)
SELECT id, "eventId", "authorId", title, description,
  ARRAY(SELECT json_array_elements_text(tags::json))::text[],
  status::session_status,
  COALESCE(type, 'discussion')::session_type
FROM json_to_recordset(:'sessions'::json)
  AS x(id uuid, "eventId" uuid, "authorId" uuid, title varchar, description text, tags text, status varchar, type varchar)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, event_id, name, description, max_capacity, type)
SELECT id, "eventId", name, description, "maxCapacity", type::room_type
FROM json_to_recordset(:'rooms'::json)
  AS x(id uuid, "eventId" uuid, name varchar, description text, "maxCapacity" integer, type varchar)
ON CONFLICT (id) DO NOTHING;

INSERT INTO session_stars (user_id, session_id, event_id)
SELECT "userId", "sessionId", "eventId"
FROM json_to_recordset(:'session_stars'::json)
  AS x("userId" uuid, "sessionId" uuid, "eventId" uuid)
ON CONFLICT (user_id, session_id) DO NOTHING;

INSERT INTO rounds (id, event_id, name, duration, start_time, min_participants, break_duration, status)
SELECT id, "eventId", name, duration, "startTime",
  COALESCE("minParticipants", 1),
  COALESCE("breakDuration", 15),
  COALESCE(status, 'draft')::round_status
FROM json_to_recordset(:'rounds'::json)
  AS x(id uuid, "eventId" uuid, name varchar, duration integer, "startTime" timestamp, "minParticipants" integer, "breakDuration" integer, status varchar)
ON CONFLICT (id) DO NOTHING;

INSERT INTO round_rooms (round_id, room_id)
SELECT "roundId", "roomId"
FROM json_to_recordset(:'round_rooms'::json)
  AS x("roundId" uuid, "roomId" uuid)
ON CONFLICT (round_id, room_id) DO NOTHING;

INSERT INTO slots (id, round_id, room_id, session_id, slot_index)
SELECT id, "roundId", "roomId", "sessionId", "slotIndex"
FROM json_to_recordset(:'slots'::json)
  AS x(id uuid, "roundId" uuid, "roomId" uuid, "sessionId" uuid, "slotIndex" integer)
ON CONFLICT (id) DO NOTHING;

INSERT INTO slot_registrations (slot_id, user_id)
SELECT "slotId", "userId"
FROM json_to_recordset(:'slot_registrations'::json)
  AS x("slotId" uuid, "userId" uuid)
ON CONFLICT (slot_id, user_id) DO NOTHING;

INSERT INTO introduction_rounds (id, event_id, num_slots, group_size, status)
SELECT id, "eventId",
  COALESCE("numSlots", 2),
  COALESCE("groupSize", 10),
  COALESCE(status, 'draft')::intro_round_status
FROM json_to_recordset(:'introduction_rounds'::json)
  AS x(id uuid, "eventId" uuid, "numSlots" integer, "groupSize" integer, status varchar)
ON CONFLICT (id) DO NOTHING;

EOSQL

echo "Seeding complete!"
