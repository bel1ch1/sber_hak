// gmail-client.ts — Gmail API (HTTPS) read + send

import { google } from "googleapis"
import MailComposer from "nodemailer/lib/mail-composer/index.js"
import type { GmailCredentials } from "./gmail-config.ts"
import { isSendEnabled } from "./gmail-config.ts"
import type { GetMessageArgs, ListMessagesArgs, SendMailArgs } from "./gmail-schemas.ts"

/** Mail + Calendar — one refresh token for gmail-mcp and google-calendar-mcp. */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
]

const ALLOWED_ATTACHMENT_EXT = new Set([
  "xlsx",
  "xls",
  "pdf",
  "md",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "csv",
])

export type FolderInfo = { path: string; name: string; id: string }
export type MessageHeader = {
  uid: string
  subject: string
  from: string[]
  to: string[]
  date: string
  seen: boolean
}
export type MessageBody = MessageHeader & {
  text: string
  html?: string
  cc: string[]
}

function oauth2(creds: GmailCredentials) {
  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret)
  client.setCredentials({ refresh_token: creds.refreshToken })
  return client
}

function gmailApi(creds: GmailCredentials) {
  return google.gmail({ version: "v1", auth: oauth2(creds) })
}

/** Map IMAP-ish folder names to Gmail label ids. */
export function resolveLabelId(folder: string, labels: FolderInfo[]): string {
  const f = folder.trim()
  const upper = f.toUpperCase()
  if (upper === "INBOX" || f === "Inbox") return "INBOX"
  if (upper === "SENT" || upper === "[GMAIL]/SENT MAIL" || /sent/i.test(f)) {
    const sent = labels.find((l) => l.id === "SENT" || /sent/i.test(l.name))
    return sent?.id ?? "SENT"
  }
  const byId = labels.find((l) => l.id === f)
  if (byId) return byId.id
  const byName = labels.find((l) => l.name.toLowerCase() === f.toLowerCase() || l.path === f)
  if (byName) return byName.id
  return f
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers) return ""
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase())
  return (h?.value ?? "").trim()
}

function splitAddresses(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function decodeBodyData(data?: string | null): string {
  if (!data) return ""
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(b64, "base64").toString("utf8")
}

function walkParts(
  part: {
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: unknown[] | null
  } | null | undefined,
  out: { text: string; html: string },
): void {
  if (!part) return
  const mt = (part.mimeType ?? "").toLowerCase()
  if (mt === "text/plain" && part.body?.data) {
    out.text += decodeBodyData(part.body.data)
  } else if (mt === "text/html" && part.body?.data) {
    out.html += decodeBodyData(part.body.data)
  }
  if (Array.isArray(part.parts)) {
    for (const p of part.parts as typeof part[]) walkParts(p, out)
  }
}

export async function listFolders(creds: GmailCredentials): Promise<FolderInfo[]> {
  const gmail = gmailApi(creds)
  const res = await gmail.users.labels.list({ userId: "me" })
  const labels = res.data.labels ?? []
  return labels
    .filter((l) => l.id && l.name)
    .map((l) => ({
      id: l.id!,
      name: l.name!,
      path: l.id === "INBOX" ? "INBOX" : l.id === "SENT" ? "SENT" : l.name!,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function verifyMailConnection(creds: GmailCredentials): Promise<{
  profile: string
  labels: number
}> {
  const gmail = gmailApi(creds)
  const [profile, labels] = await Promise.all([
    gmail.users.getProfile({ userId: "me" }),
    gmail.users.labels.list({ userId: "me" }),
  ])
  return {
    profile: profile.data.emailAddress ?? creds.userEmail ?? "me",
    labels: labels.data.labels?.length ?? 0,
  }
}

export async function listMessages(
  creds: GmailCredentials,
  args: ListMessagesArgs,
): Promise<MessageHeader[]> {
  const gmail = gmailApi(creds)
  const folders = await listFolders(creds)
  const labelId = resolveLabelId(args.folder, folders)

  const qParts: string[] = []
  if (args.since) {
    // Gmail `after:` wants yyyy/mm/dd or epoch seconds
    const d = new Date(args.since)
    if (!Number.isNaN(d.getTime())) {
      qParts.push(`after:${Math.floor(d.getTime() / 1000)}`)
    }
  }
  if (args.unseen_only) qParts.push("is:unread")

  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults: args.limit,
    q: qParts.length ? qParts.join(" ") : undefined,
  })

  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean)
  const out: MessageHeader[] = []
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    })
    const headers = msg.data.payload?.headers ?? []
    const labelIds = msg.data.labelIds ?? []
    out.push({
      uid: id,
      subject: headerValue(headers, "Subject"),
      from: splitAddresses(headerValue(headers, "From")),
      to: splitAddresses(headerValue(headers, "To")),
      date: headerValue(headers, "Date") || msg.data.internalDate || "",
      seen: !labelIds.includes("UNREAD"),
    })
  }
  return out
}

export async function getMessage(
  creds: GmailCredentials,
  args: GetMessageArgs,
): Promise<MessageBody> {
  const gmail = gmailApi(creds)
  const id = String(args.uid)
  const msg = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  })
  const headers = msg.data.payload?.headers ?? []
  const bodies = { text: "", html: "" }
  walkParts(msg.data.payload as Parameters<typeof walkParts>[0], bodies)
  if (!bodies.text && msg.data.payload?.body?.data) {
    bodies.text = decodeBodyData(msg.data.payload.body.data)
  }
  const labelIds = msg.data.labelIds ?? []
  return {
    uid: id,
    subject: headerValue(headers, "Subject"),
    from: splitAddresses(headerValue(headers, "From")),
    to: splitAddresses(headerValue(headers, "To")),
    cc: splitAddresses(headerValue(headers, "Cc")),
    date: headerValue(headers, "Date") || msg.data.internalDate || "",
    seen: !labelIds.includes("UNREAD"),
    text: bodies.text || bodies.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    html: bodies.html || undefined,
  }
}

function assertAttachments(attachments: SendMailArgs["attachments"]): void {
  if (!attachments?.length) return
  for (const a of attachments) {
    const ext = a.filename.includes(".")
      ? a.filename.slice(a.filename.lastIndexOf(".") + 1).toLowerCase()
      : ""
    if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
      throw new Error(
        `AttachmentRejected: extension ".${ext}" not allowed. Allowed: ${[...ALLOWED_ATTACHMENT_EXT].join(", ")}`,
      )
    }
    const buf = Buffer.from(a.content_base64, "base64")
    if (buf.byteLength > 5 * 1024 * 1024) {
      throw new Error(`AttachmentRejected: ${a.filename} exceeds 5 MiB`)
    }
  }
}

async function buildRawMime(args: SendMailArgs, fromEmail: string): Promise<string> {
  assertAttachments(args.attachments)
  const mail = new MailComposer({
    from: fromEmail,
    to: args.to.join(", "),
    cc: args.cc?.length ? args.cc.join(", ") : undefined,
    bcc: args.bcc?.length ? args.bcc.join(", ") : undefined,
    subject: args.subject,
    text: args.text,
    attachments: args.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content_base64, "base64"),
      contentType: a.content_type,
    })),
  })
  const mime = await mail.compile().build()
  return mime
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function sendMail(
  creds: GmailCredentials,
  args: SendMailArgs,
): Promise<{
  messageId: string
  accepted: string[]
  rejected: string[]
  threadId?: string
}> {
  if (!isSendEnabled()) {
    throw new Error("MailSendDisabled: set MAIL_SEND_ENABLED=true to allow gmail_send")
  }
  const gmail = gmailApi(creds)
  const profile = await gmail.users.getProfile({ userId: "me" })
  const fromEmail = creds.userEmail?.trim() || profile.data.emailAddress
  if (!fromEmail) throw new Error("Gmail profile has no emailAddress; set GMAIL_USER")

  const raw = await buildRawMime(args, fromEmail)
  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  })

  return {
    messageId: sent.data.id ?? "",
    threadId: sent.data.threadId ?? undefined,
    accepted: [...args.to, ...(args.cc ?? []), ...(args.bcc ?? [])],
    rejected: [],
  }
}

export { SCOPES }
