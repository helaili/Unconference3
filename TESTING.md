# API Endpoint Testing Guide

Every new API endpoint **must** ship with tests. This document describes the
conventions, helpers, and checklist that apply to all server routes under
`server/routes/api/` and `server/api/`.

---

## Test Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner (unit + API integration) |
| **@nuxt/test-utils** | Boots a real Nuxt server for API tests |
| **Testcontainers** | Spins up a disposable PostgreSQL 17 container per run |
| **Playwright** | E2E browser tests (separate from API tests) |

## Directory Layout

```
test/
├── global-setup.ts          # Starts the PostgreSQL testcontainer
├── db/                      # JSON fixture data (users, events, invitees, …)
├── api/                     # API integration tests   → vitest project "api"
│   ├── helpers.ts           # Shared utilities & constants
│   └── *.test.ts
├── unit/                    # Pure unit tests          → vitest project "unit"
│   └── *.test.ts
└── nuxt/                    # Vue component tests      → vitest project "nuxt"
    └── *.test.ts
```

API tests live in **`test/api/`** and run against a real Nuxt server backed by
the testcontainer database. They are executed **sequentially**
(`fileParallelism: false`) to avoid race conditions on shared DB state.

---

## Running Tests

```bash
# All tests (unit + api + nuxt)
npm run test

# Only API integration tests
npm run test:api

# Only unit tests
npm run test:unit

# Watch mode (re-runs on file change)
npm run test:watch
```

> **Prerequisite:** Docker must be running — the test suite starts a PostgreSQL
> container automatically via `test/global-setup.ts`.

---

## Writing a New API Test

### 1. Create the test file

Add a file in `test/api/` named after the resource or feature:

```
test/api/<resource>.test.ts
```

### 2. Use the standard boilerplate

Every API test file follows the same structure:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  migrateAndSeed,
  loginAs,
  ADMIN_EMAIL,
  REGULAR_USER_EMAIL,
  // import any other constants you need from helpers
} from './helpers'

describe('<Resource> Endpoints', async () => {
  let adminCookies: string
  let userCookies: string

  // Boot a real Nuxt server with local auth enabled
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

  // Seed the database and authenticate test users
  beforeAll(async () => {
    await migrateAndSeed()
    adminCookies = await loginAs(fetch, ADMIN_EMAIL)
    userCookies = await loginAs(fetch, REGULAR_USER_EMAIL)
  })

  // ... your test cases go here
})
```

### 3. Cover the required test cases

Every endpoint **must** include at least the following categories of tests:

#### Authentication

```ts
it('returns 401 when not authenticated', async () => {
  const res = await fetch('/api/things')
  expect(res.status).toBe(401)
})
```

#### Authorization (role-based access)

If the endpoint is restricted to admins or staff, verify that unauthorized
roles are rejected:

```ts
it('returns 403 for non-admin user', async () => {
  const res = await fetch('/api/things', {
    headers: { Cookie: userCookies },
  })
  expect(res.status).toBe(403)
})
```

#### Happy path

Verify the endpoint returns the correct data for an authorized request:

```ts
it('returns the list of things for admin', async () => {
  const res = await fetch('/api/things', {
    headers: { Cookie: adminCookies },
  })
  expect(res.status).toBe(200)
  const body = await res.json() as Array<{ id: string; name: string }>
  expect(body.length).toBeGreaterThanOrEqual(1)
  expect(body[0].name).toBeDefined()
})
```

#### Input validation (for POST / PUT)

Verify that missing or invalid fields return `400`:

```ts
it('returns 400 when required field is missing', async () => {
  const res = await fetch('/api/things', {
    method: 'POST',
    headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'No name provided' }),
  })
  expect(res.status).toBe(400)
})
```

#### Not-found handling (for ID-based routes)

```ts
it('returns 404 for non-existent resource', async () => {
  const res = await fetch('/api/things/00000000-0000-0000-0000-000000000000', {
    headers: { Cookie: adminCookies },
  })
  expect(res.status).toBe(404)
})
```

#### Mutation verification (for POST / PUT / DELETE)

After creating or updating a resource, fetch it again to confirm persistence:

```ts
it('creates a thing and it is retrievable', async () => {
  const create = await fetch('/api/things', {
    method: 'POST',
    headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'New Thing' }),
  })
  expect(create.status).toBe(200)
  const created = await create.json() as { id: string }

  const get = await fetch(`/api/things/${created.id}`, {
    headers: { Cookie: adminCookies },
  })
  expect(get.status).toBe(200)
  const fetched = await get.json() as { name: string }
  expect(fetched.name).toBe('New Thing')
})
```

---

## Test Checklist

Use this checklist before submitting a PR that adds or changes an API endpoint:

- [ ] **Test file exists** in `test/api/` for the new endpoint
- [ ] **401 — Unauthenticated** request returns 401
- [ ] **403 — Unauthorized** role is rejected (if endpoint is restricted)
- [ ] **200 — Happy path** returns correct data and status
- [ ] **400 — Validation** rejects missing or invalid input (POST/PUT)
- [ ] **404 — Not found** returns 404 for non-existent resources (ID routes)
- [ ] **Mutation round-trip** — created/updated data is verified via a follow-up GET
- [ ] **Cleanup** — if a test mutates shared seed data, restore it afterwards
- [ ] **All tests pass** — run `npm run test` before pushing

---

## Available Helpers (`test/api/helpers.ts`)

### `migrateAndSeed()`

Drops all tables, runs Drizzle migrations, and seeds the database from the JSON
fixtures in `test/db/`. Call this in `beforeAll` so every test file starts from
a known state.

### `loginAs(fetchFn, email, password?)`

Authenticates via `POST /api/auth/login` and returns the session cookie string.
Default password is `TEST_PASSWORD` (`'unconference'`).

```ts
const cookies = await loginAs(fetch, 'someone@example.com')
const res = await fetch('/api/things', {
  headers: { Cookie: cookies },
})
```

### Constants

| Constant | Value |
|----------|-------|
| `ADMIN_EMAIL` | `'helaili@github.com'` |
| `REGULAR_USER_EMAIL` | `'diana.rivera@example.com'` |
| `TEST_PASSWORD` | `'unconference'` |
| `TEST_EVENT_ID` | `'a0000000-0000-0000-0000-000000000001'` |
| `TEST_INVITEE_ALICE_ID` | `'c0000000-0000-0000-0000-000000000001'` |
| `TEST_INVITEE_BOB_ID` | `'c0000000-0000-0000-0000-000000000002'` |
| `TEST_INVITEE_DIANA_ID` | `'c0000000-0000-0000-0000-000000000010'` |

---

## Adding Fixture Data

Test fixtures live in `test/db/` as JSON files. If your new endpoint depends on
data that does not yet exist in the fixtures:

1. Add entries to the appropriate JSON file (or create a new one).
2. Update `migrateAndSeed()` in `helpers.ts` to insert the new data.
3. Export any well-known IDs as constants in `helpers.ts`.

---

## Unit Tests for Utility Functions

If your endpoint introduces a new utility function under `server/utils/`, add a
**unit test** in `test/unit/`. Unit tests run in plain Node without Nuxt or
a database:

```ts
import { describe, it, expect } from 'vitest'
import { myHelper } from '../../server/utils/my-helper'

describe('myHelper', () => {
  it('does the expected thing', () => {
    expect(myHelper('input')).toBe('output')
  })
})
```

---

## Tips

- **Sequential execution** — API tests share a database, so they run one file
  at a time. Keep test files focused on a single resource to limit blast radius.
- **Restore mutations** — if a test modifies seeded data (e.g. renames an
  event), restore the original values at the end of the test so later tests
  are not affected.
- **Type assertions** — cast `res.json()` to a typed value
  (`as Record<string, unknown>` or a specific interface) so assertions are
  readable and catch unexpected shapes.
- **Timeout** — API tests have a 30-second timeout. If a test legitimately
  needs longer, adjust it with `it('...', async () => { ... }, 60_000)`.
