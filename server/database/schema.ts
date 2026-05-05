import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ───────────────────────────────────────────────────────────────────
export const roomTypeValues = ['workshop', 'meeting', 'both'] as const
export type RoomType = (typeof roomTypeValues)[number]
export const roomTypeEnum = pgEnum('room_type', roomTypeValues)

export const inviteeRoleValues = ['participant', 'moderator', 'staff'] as const
export type InviteeRole = (typeof inviteeRoleValues)[number]
export const inviteeRoleEnum = pgEnum('invitee_role', inviteeRoleValues)

export const sessionStatusValues = ['proposed', 'published', 'scheduled', 'delivered'] as const
export type SessionStatus = (typeof sessionStatusValues)[number]
export const sessionStatusEnum = pgEnum('session_status', sessionStatusValues)

export const sessionTypeValues = ['discussion', 'workshop'] as const
export type SessionType = (typeof sessionTypeValues)[number]
export const sessionTypeEnum = pgEnum('session_type', sessionTypeValues)

// ── Events ──────────────────────────────────────────────────────────────────
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  date: timestamp('date', { mode: 'date' }),
  submissionRestricted: boolean('submission_restricted').notNull().default(false),
  minStars: integer('min_stars').notNull().default(4),
  maxStars: integer('max_stars').notNull().default(6),
  defaultDiscussionDuration: integer('default_discussion_duration').notNull().default(30),
  defaultWorkshopDuration: integer('default_workshop_duration').notNull().default(75),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

export const eventsRelations = relations(events, ({ many }) => ({
  invitees: many(invitees),
  userEvents: many(userEvents),
  sessions: many(sessions),
  rooms: many(rooms),
  sessionStars: many(sessionStars),
}))

// ── Invitees ────────────────────────────────────────────────────────────────
export const invitees = pgTable(
  'invitees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role: inviteeRoleEnum('role').notNull().default('participant'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.eventId, t.email)],
)

export const inviteesRelations = relations(invitees, ({ one, many }) => ({
  event: one(events, { fields: [invitees.eventId], references: [events.id] }),
  invitations: many(invitations),
}))

// ── Invitations ─────────────────────────────────────────────────────────────
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviteeId: uuid('invitee_id')
    .notNull()
    .references(() => invitees.id, { onDelete: 'cascade' }),
  token: uuid('token').notNull().unique().defaultRandom(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
})

export const invitationsRelations = relations(invitations, ({ one }) => ({
  invitee: one(invitees, {
    fields: [invitations.inviteeId],
    references: [invitees.id],
  }),
}))

// ── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique(),
  login: varchar('login', { length: 255 }).unique(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

export const usersRelations = relations(users, ({ many }) => ({
  userEvents: many(userEvents),
  sessions: many(sessions),
  sessionStars: many(sessionStars),
}))

// ── User Events (join table) ────────────────────────────────────────────────
export const userEvents = pgTable(
  'user_events',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
)

export const userEventsRelations = relations(userEvents, ({ one }) => ({
  user: one(users, { fields: [userEvents.userId], references: [users.id] }),
  event: one(events, { fields: [userEvents.eventId], references: [events.id] }),
}))

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default([]),
  status: sessionStatusEnum('status').notNull().default('proposed'),
  type: sessionTypeEnum('type').notNull().default('discussion'),
  duration: integer('duration'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  event: one(events, { fields: [sessions.eventId], references: [events.id] }),
  author: one(users, { fields: [sessions.authorId], references: [users.id] }),
  stars: many(sessionStars),
}))

// ── Session Stars ─────────────────────────────────────────────────────────────
export const sessionStars = pgTable(
  'session_stars',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sessionId] })],
)

export const sessionStarsRelations = relations(sessionStars, ({ one }) => ({
  user: one(users, { fields: [sessionStars.userId], references: [users.id] }),
  session: one(sessions, { fields: [sessionStars.sessionId], references: [sessions.id] }),
  event: one(events, { fields: [sessionStars.eventId], references: [events.id] }),
}))

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  maxCapacity: integer('max_capacity').notNull(),
  type: roomTypeEnum('type').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

export const roomsRelations = relations(rooms, ({ one }) => ({
  event: one(events, { fields: [rooms.eventId], references: [events.id] }),
}))
