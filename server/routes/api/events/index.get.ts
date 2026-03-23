import { events } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return useDB().select().from(events).orderBy(events.createdAt)
})
