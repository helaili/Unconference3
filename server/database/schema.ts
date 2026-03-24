import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ───────────────────────────────────────────────────────────────────
export const inviteeRoleValues = ['participant', 'moderator', 'staff'] as const
export type InviteeRole = (typeof inviteeRoleValues)[number]
export const inviteeRoleEnum = pgEnum('invitee_role', inviteeRoleValues)

// ── Events ──────────────────────────────────────────────────────────────────
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  date: timestamp('date', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
})

export const eventsRelations = relations(events, ({ many }) => ({
  invitees: many(invitees),
  userEvents: many(userEvents),
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
