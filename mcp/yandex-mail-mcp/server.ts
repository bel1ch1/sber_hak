// server.ts — MCP server: Яндекс Почта (IMAP read + SMTP send).
// Launch: `npm run server` (stdio) or `npm run server:http` (HTTP :3002).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { runServer } from "./http-transport.ts"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  readMailCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-mail.ts"
import {
  listFolders,
  listMessages,
  getMessage,
  sendMail,
} from "./yandex-mail-client.ts"
import {
  ListMessagesInput,
  GetMessageInput,
  SendMailInput,
} from "./yandex-mail-schemas.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

async function getMailContext() {
  const creds = await readMailCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) throw new Error(formatNoCredentialsError(creds.diagnostic))
  return creds
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "yandex-mail-mcp",
    version: "0.1.0",
  })

  server.tool(
    "yandex_mail_list_folders",
    "Lists IMAP mailboxes for the authenticated Yandex Mail account. READ-ONLY. " +
      "Use returned path values in list_messages / get_message (e.g. INBOX, Sent).",
    {},
    async () => {
      try {
        const ctx = await getMailContext()
        const folders = await listFolders(ctx)
        return asText(JSON.stringify(folders, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_mail_list_messages",
    "Lists message headers in a folder via IMAP. READ-ONLY. " +
      "Returns uid, subject, from, to, date, seen. Use uid + folder with yandex_mail_get_message for body. " +
      "Max 100 messages per call; newest first within the matched set.",
    {
      folder: z.string().min(1).max(500).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      since: z.string().optional(),
      unseen_only: z.boolean().optional(),
    },
    async (args) => {
      const parsed = ListMessagesInput.safeParse({ folder: "INBOX", ...args })
      if (!parsed.success) return asText("Invalid input: " + parsed.error.message)
      try {
        const ctx = await getMailContext()
        const items = await listMessages(ctx, parsed.data)
        return asText(JSON.stringify(items, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_mail_get_message",
    "Fetches a single message body by IMAP uid + folder. READ-ONLY. " +
      "Returns subject, addresses, date, text (plain), optional html.",
    {
      folder: z.string().min(1).max(500).optional(),
      uid: z.number().int().positive(),
    },
    async (args) => {
      const parsed = GetMessageInput.safeParse({ folder: "INBOX", ...args })
      if (!parsed.success) return asText("Invalid input: " + parsed.error.message)
      try {
        const ctx = await getMailContext()
        const msg = await getMessage(ctx, parsed.data)
        return asText(JSON.stringify(msg, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_mail_send",
    "Sends an email via Yandex SMTP. SIDE EFFECT — sends real mail. " +
      "Requires MAIL_SEND_ENABLED=true in MCP config. Max 50 recipients total (to+cc+bcc). " +
      "Plain text body only in v1. Does NOT attach files. " +
      "Skill should use draft/approve before calling in agent workflows.",
    {
      to: z.array(z.string().email()).min(1).max(50),
      subject: z.string().min(1).max(500),
      text: z.string().min(1).max(100_000),
      cc: z.array(z.string().email()).max(50).optional(),
      bcc: z.array(z.string().email()).max(50).optional(),
    },
    async (args) => {
      const parsed = SendMailInput.safeParse(args)
      if (!parsed.success) return asText("Invalid input: " + parsed.error.message)
      try {
        const ctx = await getMailContext()
        const result = await sendMail(ctx, parsed.data)
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
    name: "yandex-mail-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
