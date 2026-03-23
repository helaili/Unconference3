-- Test dataset for local development
-- Automatically applied when a new database container is created

INSERT INTO events (id, name, description, date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Unconference 2026', 'The best unconference ever', '2026-06-15T00:00:00.000Z');

INSERT INTO users (id, github_id, login, first_name, last_name, email, avatar_url) VALUES
  ('b0000000-0000-0000-0000-000000000001', 12345, 'testuser', 'Test', 'User', 'test@example.com', 'https://avatars.githubusercontent.com/u/12345'),
  ('b0000000-0000-0000-0000-000000000002', 2787414, 'helaili', 'Alain', 'Helaili', 'helaili@github.com', 'https://avatars.githubusercontent.com/u/2787414');

INSERT INTO invitees (id, event_id, first_name, last_name, email) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Alice', 'Smith', 'alice@example.com'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bob', 'Jones', 'bob@example.com'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Carol', 'Lee', 'carol@example.com');

INSERT INTO invitations (invitee_id, token, expires_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '2026-07-15T00:00:00.000Z'),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '2026-07-15T00:00:00.000Z'),
  ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', '2026-07-15T00:00:00.000Z');

INSERT INTO user_events (user_id, event_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
