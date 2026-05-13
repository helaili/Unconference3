# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Bundle the migration script into a standalone ESM file so the production
# image doesn't need devDependencies (e.g. tsx) to run migrations.
# drizzle-orm and postgres are kept external because they're production deps.
RUN node_modules/.bin/esbuild server/database/migrate.ts \
    --bundle --platform=node --format=esm \
    --external:postgres --external:drizzle-orm \
    --outfile=server/database/migrate.mjs

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

# Install production dependencies only (includes drizzle-orm and postgres
# which are needed by the bundled migration script at runtime).
COPY package*.json ./
RUN npm ci --omit=dev

# Self-contained Nuxt server output
COPY --from=builder /app/.output ./.output

# Migration script (placed at the same relative depth as the source so the
# bundled __dirname-based path ../../drizzle resolves to /app/drizzle).
COPY --from=builder /app/server/database/migrate.mjs ./server/database/migrate.mjs
COPY drizzle ./drizzle

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
