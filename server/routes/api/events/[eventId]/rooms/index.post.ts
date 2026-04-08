import { rooms } from '~/server/database/schema'

const logger = useLogger('rooms')

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })
  }

  await requireAdmin(event)

  const body = await readBody<{
    name: string
    description?: string
    capacity?: number
  }>(event)

  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  if (body.capacity !== undefined && body.capacity !== null) {
    if (!Number.isInteger(body.capacity) || body.capacity < 1) {
      throw createError({ statusCode: 400, statusMessage: 'capacity must be a positive integer' })
    }
  }

  const db = useDB()
  const [created] = await db
    .insert(rooms)
    .values({
      eventId,
      name: body.name.trim(),
      description: body.description ?? null,
      capacity: body.capacity ?? null,
    })
    .returning()

  logger.info(`Room created: "${created.name}" (id: ${created.id}) in event ${eventId}`)
  setResponseStatus(event, 201)
  return created
})
