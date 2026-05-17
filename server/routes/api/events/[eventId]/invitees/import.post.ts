import { eq } from 'drizzle-orm'
import { invitees, users, userEvents, inviteeRoleValues } from '~/server/database/schema'
import type { InviteeRole } from '~/server/database/schema'

const logger = useLogger('invitees-import')

interface ParticipantInput {
  fullName: string
  email: string
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return { firstName: '', lastName: trimmed }
  }
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1),
  }
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }
  await requireAdminOrStaff(event, eventId)

  const body = await readBody<{
    participants: ParticipantInput[]
    role?: InviteeRole
    registerParticipants?: boolean
    defaultPassword?: string
  }>(event)

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'participants must be a non-empty array' })
  }

  if (body.participants.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot import more than 500 participants at once' })
  }

  const role: InviteeRole = body.role && inviteeRoleValues.includes(body.role) ? body.role : 'participant'
  const registerParticipants = body.registerParticipants === true

  if (registerParticipants) {
    if (!body.defaultPassword || body.defaultPassword.length < 8) {
      throw createError({ statusCode: 400, statusMessage: 'defaultPassword must be at least 8 characters when registerParticipants is true' })
    }
  }

  // Normalise and deduplicate by email (keep first occurrence per email)
  const seen = new Set<string>()
  const rows: { firstName: string; lastName: string; email: string }[] = []
  const skippedDuplicateInPayload: string[] = []

  for (const p of body.participants) {
    if (!p.email || !p.fullName) {
      continue
    }
    const email = p.email.trim().toLowerCase()
    if (!email || seen.has(email)) {
      if (seen.has(email)) skippedDuplicateInPayload.push(email)
      continue
    }
    seen.add(email)
    const { firstName, lastName } = splitName(p.fullName)
    if (!lastName) {
      continue
    }
    rows.push({ firstName, lastName, email })
  }

  if (rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid participants found in the import data' })
  }

  const db = useDB()

  let importedCount = 0
  let registeredCount = 0

  const passwordHash = registerParticipants ? await hashPassword(body.defaultPassword!) : null

  await db.transaction(async (tx) => {
    for (const row of rows) {
      // Insert invitee; skip if (eventId, email) already exists
      const [insertedInvitee] = await tx
        .insert(invitees)
        .values({ eventId, firstName: row.firstName, lastName: row.lastName, email: row.email, role })
        .onConflictDoNothing()
        .returning({ id: invitees.id })

      if (insertedInvitee) {
        importedCount++
      }

      if (registerParticipants) {
        // Insert user if not exists, then get the user id
        const [insertedUser] = await tx
          .insert(users)
          .values({ firstName: row.firstName, lastName: row.lastName, email: row.email, passwordHash })
          .onConflictDoNothing()
          .returning({ id: users.id })

        const userId = insertedUser?.id
          ?? (await tx.select({ id: users.id }).from(users).where(eq(users.email, row.email)).limit(1))[0]?.id

        if (userId) {
          const [insertedMembership] = await tx
            .insert(userEvents)
            .values({ userId, eventId })
            .onConflictDoNothing()
            .returning({ userId: userEvents.userId })

          if (insertedMembership) {
            registeredCount++
          }
        }
      }
    }
  })

  const skippedCount = rows.length - importedCount

  logger.info(
    `Bulk import for event ${eventId}: ${importedCount} imported, ${skippedCount} skipped, ${registeredCount} registered`,
  )

  return {
    imported: importedCount,
    skipped: skippedCount,
    registered: registeredCount,
  }
})
