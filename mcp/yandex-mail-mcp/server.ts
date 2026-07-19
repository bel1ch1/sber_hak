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
  verifyMailConnection,
} from "./yandex-mail-client.ts"
import {
  ListMessagesInput,
  GetMessageInput,
  SendMailInput,
  SendMailByIdInput,
} from "./yandex-mail-schemas.ts"
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

// Obfuscator is loaded once (the directory CSV is small and stable) and cached
// for the process lifetime — the runtime ext_<hash> map must survive across
// tool calls so the agent can reply to a masked sender it saw earlier.
let obfuscatorPromise: Promise<Obfuscator> | null = null

function recipientsCsvPath(): string {
  return process.env.RECIPIENT_DIRECTORY_CSV?.trim() || path.join(PACKAGE_DIR, "recipients.csv")
}

async function getObfuscator(): Promise<Obfuscator> {
  if (!isObfuscationEnabled()) return createPassthroughObfuscator()
  if (!obfuscatorPromise) {
    obfuscatorPromise = (async () => {
      const dir = await loadRecipientDirectory(recipientsCsvPath())
      for (const w of dir.warnings) console.error(`yandex-mail-mcp: recipient directory: ${w}`)
      return createObfuscator(dir)
    })()
  }
  return obfuscatorPromise
}

async function getContext() {
  const creds = await readMailCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) throw new Error(formatNoCredentialsError(creds.diagnostic))
  const obf: Obfuscator = await getObfuscator()
  obf.registerSelf(creds.login)
  return { creds, obf }
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "yandex-mail-mcp",
    version: "0.1.0",
  })

  const obfuscationOn = isObfuscationEnabled()
  const idNote = obfuscationOn
    ? " PRIVACY: from/to/cc are opaque recipient IDs (e.g. usr_a1b2c3, self, ext_9f3a1c22), NOT email addresses — the MCP hides real addresses. Reuse those IDs with yandex_mail_send."
    : ""

  server.tool(
    "yandex_mail_list_folders",
    "Lists IMAP mailboxes for the authenticated Yandex Mail account. READ-ONLY. " +
      "Use returned path values in list_messages / get_message (e.g. INBOX, Sent).",
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
    "yandex_mail_verify",
    "Проверка доступа к Яндекс.Почте: IMAP LIST folders. READ-ONLY, писем не читает и не шлёт.",
    {},
    async () => {
      try {
        const { creds } = await getContext()
        const result = await verifyMailConnection(creds)
        return asText(JSON.stringify({ ok: true, ...result }, null, 2))
      } catch (e) {
        return asText(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2))
      }
    },
  )

  server.tool(
    "yandex_mail_list_messages",
    "Lists message headers in a folder via IMAP. READ-ONLY. " +
      "Returns uid, subject, from, to, date, seen. Use uid + folder with yandex_mail_get_message for body. " +
      "Max 100 messages per call; newest first within the matched set." +
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
    "yandex_mail_get_message",
    "Fetches a single message body by IMAP uid + folder. READ-ONLY. " +
      "Returns subject, addresses, date, text (plain), optional html." +
      idNote,
    {
      folder: z.string().min(1).max(500).optional(),
      uid: z.number().int().positive(),
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

  // Send-tool contract depends on the privacy mode. With obfuscation ON the
  // agent addresses recipients by opaque ID; the MCP resolves ID -> email
  // server-side, so the LLM never handles a real address.
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
    ? "Sends an email via Yandex SMTP. SIDE EFFECT — sends real mail. " +
      "PRIVACY MODE: to/cc/bcc are opaque recipient IDs (e.g. usr_a1b2c3, self, or an ext_… token seen in received mail), NOT email addresses. " +
      "The MCP maps IDs to real addresses internally; you never see or type an email. Unknown IDs are rejected. " +
      "In subject/text, write the same opaque IDs (e.g. usr_employee) — before SMTP the MCP expands known IDs to real logins/emails so the recipient sees the address, not the id. " +
      "Requires MAIL_SEND_ENABLED=true. Max 50 recipients total (to+cc+bcc). " +
      "Optional attachments: up to 3 files as {filename, content_base64, content_type?}; max ~5 MiB each; allowed extensions xlsx/xls/pdf/md/txt/png/jpg/jpeg/csv. " +
      "Skill should use draft/approve before calling in agent workflows."
    : "Sends an email via Yandex SMTP. SIDE EFFECT — sends real mail. " +
      "Requires MAIL_SEND_ENABLED=true in MCP config. Max 50 recipients total (to+cc+bcc). " +
      "Plain text body; optional attachments {filename, content_base64} (max 3, ~5 MiB each). " +
      "Skill should use draft/approve before calling in agent workflows."

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

  server.tool("yandex_mail_send", sendDescription, sendShape, async (args) => {
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

      // Resolve every ID to a real address up front; refuse to send if any ID
      // is unknown so mail never silently goes nowhere.
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
    name: "yandex-mail-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
