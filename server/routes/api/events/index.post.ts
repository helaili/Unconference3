import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ name: string; description?: string; date?: string }>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const [created] = await useDB()
    .insert(events)
    .values({
      name: body.name,
      description: body.description,
      date: body.date ? new Date(body.date) : null,
    })
    .returning()

  return created
})
