import { eq } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!

  const [deleted] = await useDB()
    .delete(events)
    .where(eq(events.id, id))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  return { success: true }
})
