import { users } from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useDB()
  const result = await db.query.users.findMany({
    columns: {
      passwordHash: false,
    },
    orderBy: [users.lastName, users.firstName],
  })

  return result
})
