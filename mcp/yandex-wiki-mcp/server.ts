// server.ts — MCP server: Яндекс Вики (read-only) через Public API.
// Launch: `npm run server` (stdio) or `npm run server:http` (HTTP :3001).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { runServer } from "./http-transport.ts"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  readWikiCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-wiki.ts"
import {
  getPageById,
  getPageBySlug,
  listDescendants,
  summarizePage,
} from "./yandex-wiki-client.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

async function getWikiContext() {
  const creds = await readWikiCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) throw new Error(formatNoCredentialsError(creds.diagnostic))
  return creds
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "yandex-wiki-mcp",
    version: "0.2.0",
  })

  server.tool(
    "yandex_wiki_get_page",
    "Reads a Yandex Wiki page by exact slug or numeric page_id. READ-ONLY. " +
      "Returns title, slug, content, breadcrumbs, attributes. " +
      "There is NO full-text search in Yandex Wiki API — you must know the slug or page_id. " +
      "Use yandex_wiki_list_descendants to browse a section tree.",
    {
      slug: z.string().min(1).optional(),
      page_id: z.number().int().positive().optional(),
      fields: z.string().optional(),
    },
    async (args) => {
      if (!args.slug && !args.page_id) {
        return asText("Either slug or page_id is required.")
      }
      const fields = args.fields?.trim() || "attributes,content,breadcrumbs"
      try {
        const ctx = await getWikiContext()
        const page = args.page_id
          ? await getPageById(ctx, args.page_id, fields)
          : await getPageBySlug(ctx, args.slug!, fields)
        return asText(JSON.stringify(summarizePage(page), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_wiki_list_descendants",
    "Lists child pages under a parent slug (GET /v1/pages/descendants). READ-ONLY. " +
      "Use this to navigate wiki sections when you do not know exact child slugs. " +
      "Supports pagination via cursor. Does NOT search page bodies.",
    {
      slug: z.string().min(1),
      page_size: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
      include_self: z.boolean().optional(),
    },
    async (args) => {
      try {
        const ctx = await getWikiContext()
        const result = await listDescendants(ctx, {
          slug: args.slug,
          page_size: args.page_size ?? 50,
          cursor: args.cursor,
          include_self: args.include_self ?? false,
        })
        return asText(JSON.stringify(result, null, 2))
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
    name: "yandex-wiki-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
