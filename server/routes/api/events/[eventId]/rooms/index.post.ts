import { eq } from 'drizzle-orm'
import { events, rooms } from '~/server/database/schema'
import type { RoomType } from '~/server/database/schema'

const logger = useLogger('rooms')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const [eventRow] = await useDB().select().from(events).where(eq(events.id, eventId)).limit(1)
  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const body = await readBody<{
    name?: string
    description?: string
    maxCapacity?: number
    type?: RoomType
  }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  if (body.maxCapacity === undefined || body.maxCapacity === null) {
    throw createError({ statusCode: 400, statusMessage: 'maxCapacity is required' })
  }

  if (typeof body.maxCapacity !== 'number' || !Number.isInteger(body.maxCapacity) || body.maxCapacity < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxCapacity must be a positive integer' })
  }

  if (!body.type) {
    throw createError({ statusCode: 400, statusMessage: 'type is required' })
  }

  if (!['workshop', 'meeting', 'both'].includes(body.type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be one of: workshop, meeting, both' })
  }

  const [created] = await useDB()
    .insert(rooms)
    .values({
      eventId,
      name: body.name.trim(),
      description: body.description,
      maxCapacity: body.maxCapacity,
      type: body.type,
    })
    .returning()

  logger.info(`Room created: "${created.name}" (id: ${created.id}) in event ${eventId}`)
  return created
})
