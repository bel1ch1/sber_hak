// server.ts — MCP server: рекомендации курсов Stepik для онбординга.
// Launch: `npm run server` (stdio) or `npm run server:http` (HTTP :3003).

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z } from "zod"

import { runServer } from "./http-transport.ts"
import {
  buildOnboardingSuggestion,
  getCoursesByRole,
  listRoles,
  loadCatalog,
  matchRole,
  resolveCatalogPath,
} from "./stepik-catalog.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

async function loadPackageEnv(packageDir: string): Promise<void> {
  try {
    const raw = await readFile(path.join(packageDir, ".env"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const sep = t.indexOf("=")
      if (sep === -1) continue
      const k = t.slice(0, sep).trim()
      let v = t.slice(sep + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!(k in process.env)) process.env[k] = v
    }
  } catch {
    // .env optional
  }
}

async function getCatalog() {
  const catalogPath = resolveCatalogPath(PACKAGE_DIR)
  return loadCatalog(catalogPath)
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "stepik-mcp",
    version: "0.1.0",
  })

  server.tool(
    "stepik_list_roles",
    "Lists onboarding roles from the Stepik course catalog (Excel). READ-ONLY. " +
      "Returns role name and course count per role.",
    {},
    async () => {
      try {
        const courses = await getCatalog()
        return asText(JSON.stringify(listRoles(courses), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "stepik_get_courses_by_role",
    "Returns Stepik course links for a role from the onboarding catalog. READ-ONLY. " +
      "Role matching supports aliases (e.g. IT, QA, PM). " +
      "Set include_soft_skills=false to exclude universal Soft Skills courses.",
    {
      role: z.string().min(1).max(200),
      include_soft_skills: z.boolean().optional(),
    },
    async (args) => {
      try {
        const courses = await getCatalog()
        const suggestion = buildOnboardingSuggestion(
          courses,
          args.role,
          args.include_soft_skills ?? true,
        )
        return asText(JSON.stringify(suggestion, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "stepik_suggest_onboarding",
    "Builds a human-readable onboarding plan with Stepik course links for a role. READ-ONLY. " +
      "Use in onboarding pipeline: pass employee role, return markdown with links to share. " +
      "Does not enroll users — only suggests courses.",
    {
      role: z.string().min(1).max(200),
      include_soft_skills: z.boolean().optional(),
    },
    async (args) => {
      try {
        const courses = await getCatalog()
        const suggestion = buildOnboardingSuggestion(
          courses,
          args.role,
          args.include_soft_skills ?? true,
        )
        return asText(suggestion.markdown)
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "stepik_match_role",
    "Resolves a free-text role (e.g. 'разработчик', 'IT') to a catalog role name. READ-ONLY.",
    {
      role: z.string().min(1).max(200),
    },
    async (args) => {
      try {
        const courses = await getCatalog()
        const availableRoles = [...new Set(courses.map((c) => c.role))]
        const matched = matchRole(args.role, availableRoles)
        if (!matched) {
          return asText(
            JSON.stringify(
              { matched: null, input: args.role, availableRoles },
              null,
              2,
            ),
          )
        }
        return asText(
          JSON.stringify(
            {
              matched,
              input: args.role,
              courseCount: getCoursesByRole(courses, matched).length,
            },
            null,
            2,
          ),
        )
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  return server
}

if (isMain) {
  await loadPackageEnv(PACKAGE_DIR)
  if (process.argv.includes("--http")) {
    process.env.MCP_TRANSPORT = "http"
  }
  await runServer(buildServer, {
    name: "stepik-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
