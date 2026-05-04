import { eq } from 'drizzle-orm'
import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'eventId')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Event id is required' })
  }

  await requireEventAccess(event, id)

  const [found] = await useDB()
    .select()
    .from(events)
    .where(eq(events.id, id))

  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  return found
})
