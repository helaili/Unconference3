import { eq } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; description?: string; date?: string }>(event)

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.date !== undefined) updates.date = body.date ? new Date(body.date) : null

  const [updated] = await useDB()
    .update(events)
    .set(updates)
    .where(eq(events.id, id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  return updated
})
