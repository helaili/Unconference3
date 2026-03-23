// test/global-setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'

export default async function () {
  const container = await new PostgreSqlContainer('postgres:17').start()
  process.env.DATABASE_URL = container.getConnectionUri()

  return async () => {
    await container.stop()
  }
}