// server.ts — MCP server: Gmail API (HTTPS read + send).
// Launch: `npm run server` (stdio) or `npm run server:http` (HTTP :3000).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { runServer } from "./http-transport.ts"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  readGmailCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./gmail-config.ts"
import {
  listFolders,
  listMessages,
  getMessage,
  sendMail,
  verifyMailConnection,
} from "./gmail-client.ts"
import {
  ListMessagesInput,
  GetMessageInput,
  SendMailInput,
  SendMailByIdInput,
} from "./gmail-schemas.ts"
import { loadRecipientDirectory } from "./recipient-directory.ts"
import {
  createObfuscator,
  createPassthroughObfuscator,
  isObfuscationEnabled,
  type Obfuscator,
} from "./obfuscation.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

let obfuscatorPromise: Promise<Obfuscator> | null = null

function recipientsCsvPath(): string {
  return process.env.RECIPIENT_DIRECTORY_CSV?.trim() || path.join(PACKAGE_DIR, "recipients.csv")
}

async function getObfuscator(): Promise<Obfuscator> {
  if (!isObfuscationEnabled()) return createPassthroughObfuscator()
  if (!obfuscatorPromise) {
    obfuscatorPromise = (async () => {
      const dir = await loadRecipientDirectory(recipientsCsvPath())
      for (const w of dir.warnings) console.error(`gmail-mcp: recipient directory: ${w}`)
      return createObfuscator(dir)
    })()
  }
  return obfuscatorPromise
}

let selfRegistered = false

async function getContext() {
  const result = await readGmailCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!result.ok) throw new Error(formatNoCredentialsError(result.diagnostic))
  const obf: Obfuscator = await getObfuscator()
  if (!selfRegistered) {
    if (result.creds.userEmail) {
      obf.registerSelf(result.creds.userEmail)
    } else {
      const verify = await verifyMailConnection(result.creds)
      obf.registerSelf(verify.profile)
    }
    selfRegistered = true
  }
  return { creds: result.creds, obf }
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "gmail-mcp",
    version: "0.1.0",
  })

  const obfuscationOn = isObfuscationEnabled()
  const idNote = obfuscationOn
    ? " PRIVACY: from/to/cc and known emails in subject/body are opaque recipient IDs " +
      "(e.g. usr_a1b2c3, self, ext_9f3a1c22), NOT email addresses — the MCP hides real addresses " +
      "on read (reverse-masks expanded text). Reuse those IDs with gmail_send."
    : ""

  server.tool(
    "gmail_list_folders",
    "Lists Gmail labels for the authenticated account (INBOX, SENT, custom). READ-ONLY. " +
      "Use returned path/id values in list_messages / get_message (e.g. INBOX, SENT).",
    {},
    async () => {
      try {
        const { creds } = await getContext()
        const folders = await listFolders(creds)
        return asText(JSON.stringify(folders, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "gmail_verify",
    "Проверка доступа к Gmail API: profile + labels. READ-ONLY, писем не читает и не шлёт.",
    {},
    async () => {
      try {
        const result = await readGmailCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
        if (!result.ok) {
          return asText(JSON.stringify({ ok: false, error: formatNoCredentialsError(result.diagnostic) }, null, 2))
        }
        const v = await verifyMailConnection(result.creds)
        return asText(JSON.stringify({ ok: true, ...v }, null, 2))
      } catch (e) {
        return asText(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2))
      }
    },
  )

  server.tool(
    "gmail_list_messages",
    "Lists message headers in a Gmail label/folder. READ-ONLY. " +
      "Returns uid (Gmail message id), subject, from, to, date, seen. " +
      "Use uid + folder with gmail_get_message for body. Max 100; newest first." +
      idNote,
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
        const { creds, obf } = await getContext()
        const items = await listMessages(creds, parsed.data)
        return asText(JSON.stringify(obf.maskListItems(items), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "gmail_get_message",
    "Fetches a single message body by Gmail message id (`uid`) + folder/label. READ-ONLY. " +
      "Returns subject, addresses, date, text (plain), optional html." +
      idNote,
    {
      folder: z.string().min(1).max(500).optional(),
      uid: z.union([z.string().min(1), z.number().int().positive()]),
    },
    async (args) => {
      const parsed = GetMessageInput.safeParse({ folder: "INBOX", ...args })
      if (!parsed.success) return asText("Invalid input: " + parsed.error.message)
      try {
        const { creds, obf } = await getContext()
        const msg = await getMessage(creds, parsed.data)
        return asText(JSON.stringify(obf.maskMessage(msg), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  const attachmentShape = z
    .array(
      z.object({
        filename: z.string().min(1).max(200),
        content_base64: z.string().min(1).max(7_000_000),
        content_type: z.string().min(3).max(120).optional(),
      }),
    )
    .max(3)
    .optional()

  const sendDescription = obfuscationOn
    ? "Sends an email via Gmail API (HTTPS). SIDE EFFECT — sends real mail. " +
      "PRIVACY MODE: to/cc/bcc are opaque recipient IDs (e.g. usr_a1b2c3, self, or an ext_… token), NOT email addresses. " +
      "The MCP maps IDs to real addresses internally. Unknown IDs are rejected. " +
      "In subject/text, write the same opaque IDs — MCP expands them before send. " +
      "Requires MAIL_SEND_ENABLED=true. Max 50 recipients total. " +
      "Optional attachments: up to 3 files as {filename, content_base64, content_type?}; max ~5 MiB each; allowed xlsx/xls/pdf/md/txt/png/jpg/jpeg/csv."
    : "Sends an email via Gmail API. SIDE EFFECT — sends real mail. " +
      "Requires MAIL_SEND_ENABLED=true. Max 50 recipients. " +
      "Plain text body; optional attachments {filename, content_base64} (max 3, ~5 MiB each)."

  const sendShape = obfuscationOn
    ? {
        to: z.array(z.string().min(1).max(64)).min(1).max(50),
        subject: z.string().min(1).max(500),
        text: z.string().min(1).max(100_000),
        cc: z.array(z.string().min(1).max(64)).max(50).optional(),
        bcc: z.array(z.string().min(1).max(64)).max(50).optional(),
        attachments: attachmentShape,
      }
    : {
        to: z.array(z.string().email()).min(1).max(50),
        subject: z.string().min(1).max(500),
        text: z.string().min(1).max(100_000),
        cc: z.array(z.string().email()).max(50).optional(),
        bcc: z.array(z.string().email()).max(50).optional(),
        attachments: attachmentShape,
      }

  server.tool("gmail_send", sendDescription, sendShape, async (args) => {
    try {
      const { creds, obf } = await getContext()

      if (!obf.enabled) {
        const parsed = SendMailInput.safeParse(args)
        if (!parsed.success) return asText("Invalid input: " + parsed.error.message)
        const result = await sendMail(creds, parsed.data)
        return asText(JSON.stringify(result, null, 2))
      }

      const parsed = SendMailByIdInput.safeParse(args)
      if (!parsed.success) return asText("Invalid input: " + parsed.error.message)

      const to = obf.resolveRecipients(parsed.data.to)
      const cc = obf.resolveRecipients(parsed.data.cc ?? [])
      const bcc = obf.resolveRecipients(parsed.data.bcc ?? [])
      const unknown = [...to.unknown, ...cc.unknown, ...bcc.unknown]
      if (unknown.length) {
        return asText(
          `UnknownRecipientId: ${unknown.join(", ")}. ` +
            "These IDs are not in the recipient directory. Add them to recipients.csv (id,email) " +
            "or use an ID returned by list_messages / get_message.",
        )
      }

      const result = await sendMail(creds, {
        to: to.emails,
        subject: obf.expandIdsInText(parsed.data.subject),
        text: obf.expandIdsInText(parsed.data.text),
        cc: cc.emails.length ? cc.emails : undefined,
        bcc: bcc.emails.length ? bcc.emails : undefined,
        attachments: parsed.data.attachments,
      })
      // Echo opaque ids the agent requested — remasking emails would collapse a
      // shared demo mailbox (usr_hr / usr_manager / …) to "self".
      const masked = obf.maskSendResult(result, {
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
      })
      return asText(JSON.stringify(masked, null, 2))
    } catch (e) {
      return asText(e instanceof Error ? e.message : String(e))
    }
  })

  return server
}

if (isMain) {
  await loadPackageEnv(PACKAGE_DIR)
  if (process.argv.includes("--http")) {
    process.env.MCP_TRANSPORT = "http"
  }
  await runServer(buildServer, {
    name: "gmail-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
