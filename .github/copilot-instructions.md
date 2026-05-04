# Copilot Instructions

## Worktree Setup

When starting work in a new worktree, always run these two commands before doing anything else:

```bash
.copilot/setup.sh
npm install
```

This ensures the environment is properly configured and all dependencies are installed locally
(do not use a symlink to another checkout's `node_modules` -- that causes Vite path issues).

## API Endpoint Testing Requirements

Every new API endpoint under `server/api/` or `server/routes/api/` **must** ship
with integration tests in `test/api/`.

### Test Stack

- **Vitest** — test runner
- **@nuxt/test-utils** — boots a real Nuxt server for API tests
- **Testcontainers** — disposable PostgreSQL 17 per run (started by `test/global-setup.ts`)
- Docker must be running to execute tests

### Test File Convention

Create `test/api/<resource>.test.ts` for each new resource or feature. Use this
boilerplate:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
} from './helpers'

describe('<Resource> Endpoints', async () => {
  let adminCookies: string
  let userCookies: string

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      AUTH_MODE: 'local',
      NUXT_AUTH_MODE: 'local',
      NUXT_PUBLIC_AUTH_MODE: 'local',
      ADMIN_EMAILS: ADMIN_EMAIL,
      NUXT_SESSION_PASSWORD:
        'test-session-secret-that-is-at-least-32-chars-long',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '2525',
      APP_URL: 'http://localhost:3000',
    },
  })

  beforeAll(async () => {
    await migrateAndSeed()
    adminCookies = await loginAs(fetch, ADMIN_EMAIL)
    userCookies = await loginAs(fetch, REGULAR_USER_EMAIL)
  })

  // ... test cases
})
```

### Required Test Cases for Every Endpoint

1. **401 — Unauthenticated**: request without cookies returns 401
2. **403 — Unauthorized**: restricted endpoints reject unprivileged roles
3. **200 — Happy path**: correct data and status for authorized requests
4. **400 — Validation**: POST/PUT with missing or invalid input returns 400
5. **404 — Not found**: ID-based routes return 404 for non-existent resources
6. **Mutation round-trip**: after POST/PUT/DELETE, verify the change via a follow-up GET

### Available Helpers (`test/api/helpers.ts`)

| Helper | Purpose |
|--------|---------|
| `migrateAndSeed()` | Drops tables, runs migrations, seeds from `test/db/*.json` |
| `loginAs(fetch, email, password?)` | Authenticates and returns session cookie string |
| `ADMIN_EMAIL` | `'helaili@github.com'` |
| `REGULAR_USER_EMAIL` | `'diana.rivera@example.com'` |
| `TEST_PASSWORD` | `'unconference'` |
| `TEST_EVENT_ID` | `'a0000000-0000-0000-0000-000000000001'` |

### Running Tests

```bash
npm run test        # all tests (unit + api + nuxt)
npm run test:unit   # unit tests only
npm run test:api    # API integration tests only
```

### Cleanup Rule

If a test mutates seeded data, restore the original values at the end of the
test so later tests are unaffected.

### Unit Tests for Utilities

New utility functions under `server/utils/` should have a matching unit test in
`test/unit/`. Unit tests run in plain Node — no database or Nuxt server needed.
