# Server-Side Logging Guide

This project uses [consola](https://github.com/unjs/consola) for structured server-side logging with environment-aware verbosity levels. Consola is bundled with Nuxt/Nitro — no extra dependencies are needed.

## Architecture

| Component | File | Purpose |
|-----------|------|---------|
| Logger utility | `server/utils/logger.ts` | Exports `log` (root logger) and `useLogger(tag)` (tagged logger) |
| Request middleware | `server/middleware/log.ts` | Logs every HTTP request with method, path, status, and duration |

Both `log` and `useLogger` are **auto-imported** in all server code (routes, middleware, utilities) — no import statement needed.

## Log Levels

| Level | Method | When to use |
|-------|--------|-------------|
| `error` | `logger.error()` | Unexpected failures: unhandled exceptions, external service errors, data corruption |
| `warn` | `logger.warn()` | Suspicious but recoverable: failed login attempts, expired tokens, authorization denials |
| `info` | `logger.info()` | Notable operations: user login/registration, CRUD mutations, emails sent |
| `debug` | `logger.debug()` | Verbose details: every HTTP request/response, query parameters, intermediate state |
| `trace` | `logger.trace()` | Extremely verbose: full request bodies, raw DB results (rarely needed) |

### Default Verbosity per Environment

| Environment | Default Level | What's visible |
|-------------|--------------|----------------|
| **Development** (`nuxt dev`) | `debug` | Everything except trace |
| **Production** (`nuxt build` + run) | `warn` | Only warnings, errors, and fatal |

### Override via Environment Variable

Set `LOG_LEVEL` to override the default for any environment:

```bash
# Show all logs in production (for debugging a deployed issue)
LOG_LEVEL=debug node .output/server/index.mjs

# Silence everything except errors during dev
LOG_LEVEL=error nuxt dev

# Show absolutely everything
LOG_LEVEL=trace nuxt dev
```

Valid values: `fatal`, `error`, `warn`, `log`, `info`, `debug`, `trace`, `silent`, `verbose`.

## How to Add Logging to New Code

### 1. Create a tagged logger at the module level

```typescript
// server/routes/api/widgets/index.post.ts
const logger = useLogger('widgets')

export default defineEventHandler(async (event) => {
  // ...
  logger.info(`Widget created: ${widget.name} (id: ${widget.id})`)
  return widget
})
```

The tag appears in log output to identify the source: `[widgets] Widget created: Foo (id: abc-123)`.

### 2. Choose the right level

```typescript
// ✅ info — notable successful operation
logger.info(`Event created: "${event.name}" (id: ${event.id})`)

// ✅ warn — suspicious activity, not necessarily an error
logger.warn(`Failed login attempt for: ${email}`)

// ✅ error — something broke unexpectedly
logger.error('GitHub OAuth error:', error)

// ✅ debug — useful during development, hidden in production
logger.debug(`Query returned ${results.length} rows`)
```

### 3. Guidelines

- **Do** log all state-changing operations (create, update, delete) at `info` level
- **Do** log authentication events (login success/failure, OAuth) at `info`/`warn`
- **Do** log external service interactions (email, OAuth) at `info` for success, `error` for failure
- **Do** include entity identifiers (IDs, emails) in log messages for traceability
- **Don't** log passwords, tokens, or secrets — ever
- **Don't** log full request/response bodies at `info` level (use `debug` or `trace`)
- **Don't** use `console.log` / `console.error` — always use the logger

### 4. Standard tags

Use consistent tags so logs can be filtered:

| Tag | Used for |
|-----|----------|
| `auth` | Login, registration, OAuth flows |
| `users` | User CRUD operations |
| `events` | Event CRUD operations |
| `invitees` | Invitee CRUD operations |
| `invitations` | Invitation creation and token validation |
| `email` | Email sending |
| `database` | Database connection lifecycle |
| `request` | HTTP request/response (handled by middleware) |

## Request Middleware

The `server/middleware/log.ts` middleware automatically logs **every** server request:

- **2xx/3xx** responses → `debug` (hidden in production)
- **4xx** responses → `warn`
- **5xx** responses → `error`

Output format: `[request] POST /api/events → 201 (45ms)`

This means you don't need to manually log "request received" in your route handlers — only log domain-specific events.

## Examples

### Route with CRUD logging
```typescript
const logger = useLogger('widgets')

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ name: string }>(event)
  if (!body.name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const [created] = await useDB()
    .insert(widgets)
    .values({ name: body.name })
    .returning()

  logger.info(`Widget created: "${created.name}" (id: ${created.id})`)
  return created
})
```

### Utility with error logging
```typescript
const logger = useLogger('payments')

export async function chargeCard(userId: string, amount: number) {
  logger.debug(`Charging user ${userId}: $${amount}`)
  try {
    const result = await paymentGateway.charge({ userId, amount })
    logger.info(`Payment successful: user ${userId}, $${amount}`)
    return result
  }
  catch (error) {
    logger.error(`Payment failed for user ${userId}:`, error)
    throw error
  }
}
```
