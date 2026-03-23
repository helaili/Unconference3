import { eq } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!

  const [found] = await useDB()
    .select()
    .from(events)
    .where(eq(events.id, id))

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  return found
})
