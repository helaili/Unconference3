import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { joinSession } from "@github/copilot-sdk/extension";

const cwd = process.cwd();

/**
 * Read a file relative to the project root, returning its contents or an error
 * message.
 */
function readProjectFile(relPath) {
  const abs = resolve(cwd, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf-8");
}

/**
 * Detect whether a file path is an API route that should have tests.
 */
function isApiRoute(filePath) {
  const rel = relative(cwd, resolve(cwd, filePath));
  return (
    (rel.startsWith("server/api/") || rel.startsWith("server/routes/api/")) &&
    !rel.includes("__") &&
    (rel.endsWith(".ts") || rel.endsWith(".js"))
  );
}

/**
 * Build the test scaffold for a given API route file.
 */
function buildTestScaffold(endpointPath, sourceCode) {
  const methods = [];
  for (const m of [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]) {
    const handlerRe = new RegExp(
      `defineEventHandler|export\\s+default|${m.toLowerCase()}`,
      "i",
    );
    // Check explicit method handler files (.get.ts, .post.ts, etc.)
    if (endpointPath.includes(`.${m.toLowerCase()}.`)) {
      methods.push(m);
    }
    // Also detect from source if it's a catch-all handler
    if (
      methods.length === 0 &&
      sourceCode &&
      handlerRe.test(sourceCode)
    ) {
      // Will be detected from file name or we default to GET
    }
  }
  if (methods.length === 0) methods.push("GET");

  // Derive the API URL path from the file path
  let urlPath = endpointPath
    .replace(/^server\/routes/, "")
    .replace(/^server\/api/, "/api")
    .replace(/\.(get|post|put|patch|delete)?\.(ts|js)$/, "")
    .replace(/\/index$/, "");

  // Replace [param] with :param for display
  urlPath = urlPath.replace(/\[([^\]]+)\]/g, ":$1");

  // Detect auth requirements from source
  const needsAdmin =
    sourceCode &&
    (sourceCode.includes("requireAdmin") ||
      sourceCode.includes("isAdmin"));
  const needsStaff =
    sourceCode &&
    (sourceCode.includes("requireAdminOrStaff") ||
      sourceCode.includes("isStaffForEvent"));
  const hasBody =
    sourceCode &&
    (sourceCode.includes("readBody") ||
      sourceCode.includes("readValidatedBody"));

  const testCases = [];

  // 401 — Unauthenticated
  testCases.push(`    it('returns 401 when not authenticated', async () => {
      const res = await fetch('${urlPath}')
      expect(res.status).toBe(401)
    })`);

  // 403 — Unauthorized role
  if (needsAdmin || needsStaff) {
    testCases.push(`    it('returns 403 for unauthorized user', async () => {
      const res = await fetch('${urlPath}', {
        headers: { Cookie: userCookies },
      })
      expect(res.status).toBe(403)
    })`);
  }

  // Happy path per method
  for (const method of methods) {
    if (method === "GET") {
      testCases.push(`    it('returns 200 for authorized request', async () => {
      const res = await fetch('${urlPath}', {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // TODO: assert response shape
    })`);
    } else if (method === "POST" || method === "PUT" || method === "PATCH") {
      // Validation — missing fields
      if (hasBody) {
        testCases.push(`    it('returns 400 when required fields are missing', async () => {
      const res = await fetch('${urlPath}', {
        method: '${method}',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })`);
      }

      // Happy path
      testCases.push(`    it('${method === "POST" ? "creates" : "updates"} the resource', async () => {
      const res = await fetch('${urlPath}', {
        method: '${method}',
        headers: { Cookie: adminCookies, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // TODO: add valid payload
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // TODO: assert response shape
    })`);
    } else if (method === "DELETE") {
      testCases.push(`    it('deletes the resource', async () => {
      const res = await fetch('${urlPath}', {
        method: 'DELETE',
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(200)
    })`);
    }
  }

  // 404 for parameterized routes
  if (urlPath.includes(":")) {
    const notFoundUrl = urlPath.replace(
      /:[^/]+/g,
      "00000000-0000-0000-0000-000000000000",
    );
    testCases.push(`    it('returns 404 for non-existent resource', async () => {
      const res = await fetch('${notFoundUrl}', {
        headers: { Cookie: adminCookies },
      })
      expect(res.status).toBe(404)
    })`);
  }

  const helpers = ["migrateAndSeed", "loginAs", "ADMIN_EMAIL", "REGULAR_USER_EMAIL"];
  if (urlPath.includes("event")) helpers.push("TEST_EVENT_ID");

  return `import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import {
  ${helpers.join(",\n  ")},
} from './helpers'

describe('${urlPath} Endpoints', async () => {
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

${testCases.join("\n\n")}
})
`;
}

// ─── Extension ────────────────────────────────────────────────────────

const session = await joinSession({
  hooks: {
    onPostToolUse: async (input) => {
      // When an API route file is created or edited, remind the agent to
      // add tests.
      if (input.toolName !== "create" && input.toolName !== "edit") return;

      const filePath = String(input.toolArgs?.path || "");
      if (!isApiRoute(filePath)) return;

      const rel = relative(cwd, resolve(cwd, filePath));
      return {
        additionalContext: [
          `⚠️  You just ${input.toolName === "create" ? "created" : "modified"} an API route: ${rel}`,
          "This project requires every API endpoint to have integration tests.",
          "Use the generate_api_test tool to scaffold a test file, then fill in the TODOs.",
          "See .github/copilot-instructions.md for the full testing conventions.",
        ].join("\n"),
      };
    },
  },

  tools: [
    {
      name: "generate_api_test",
      description:
        "Generate a Vitest integration test scaffold for an API endpoint. " +
        "Reads the endpoint source, detects HTTP methods, auth requirements, " +
        "and body parsing, then returns a ready-to-use test file with TODO " +
        "markers for assertions that need to be filled in.",
      parameters: {
        type: "object",
        properties: {
          endpoint_path: {
            type: "string",
            description:
              "Path to the API route file relative to the project root, " +
              "e.g. 'server/routes/api/events/index.get.ts'",
          },
        },
        required: ["endpoint_path"],
      },
      handler: async (args) => {
        const relPath = args.endpoint_path;
        const source = readProjectFile(relPath);

        if (!source) {
          return {
            textResultForLlm: `Error: file not found at ${relPath}. Provide a path relative to the project root.`,
            resultType: "failure",
          };
        }

        if (!isApiRoute(relPath)) {
          return {
            textResultForLlm: `Error: ${relPath} does not look like an API route (expected a file under server/api/ or server/routes/api/).`,
            resultType: "failure",
          };
        }

        const scaffold = buildTestScaffold(relPath, source);

        return [
          "Generated test scaffold below. Save it to test/api/<resource>.test.ts",
          "then fill in the TODO comments with real assertions.",
          "",
          "```typescript",
          scaffold,
          "```",
        ].join("\n");
      },
    },
  ],
});

await session.log("API test generator extension loaded");
