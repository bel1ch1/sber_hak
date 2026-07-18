// yandex-mail-client.ts — IMAP read + SMTP send for Yandex Mail.
import { ImapFlow } from "imapflow"
import nodemailer from "nodemailer"
import { simpleParser } from "mailparser"
import type { MailCredentials } from "./yandex-mail.ts"

type MailCredsOk = Extract<MailCredentials, { ok: true }>

function imapAuth(creds: MailCredsOk) {
  if (creds.authMode === "oauth") {
    return { user: creds.login, accessToken: creds.oauthToken! }
  }
  return { user: creds.login, pass: creds.appPassword! }
}

function smtpAuth(creds: MailCredsOk) {
  if (creds.authMode === "oauth") {
    return {
      type: "OAuth2" as const,
      user: creds.login,
      accessToken: creds.oauthToken!,
    }
  }
  return { user: creds.login, pass: creds.appPassword! }
}

async function withImapClient<T>(creds: MailCredsOk, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: true,
    auth: imapAuth(creds),
    logger: false,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

export interface MailFolder {
  path: string
  name: string
  specialUse?: string
}

export interface MailListItem {
  uid: number
  subject: string
  from: string[]
  to: string[]
  date: string
  seen: boolean
}

export interface MailMessage {
  uid: number
  subject: string
  from: string[]
  to: string[]
  cc: string[]
  date: string
  text: string
  html?: string
}

export interface MailAttachmentInput {
  filename: string
  content_base64: string
  content_type?: string
}

export interface SendMailInput {
  to: string[]
  subject: string
  text: string
  cc?: string[]
  bcc?: string[]
  attachments?: MailAttachmentInput[]
}

export interface SendMailResult {
  message_id: string
  accepted: string[]
  rejected: string[]
  attachment_names?: string[]
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

function decodeAttachments(attachments: MailAttachmentInput[] | undefined): {
  filename: string
  content: Buffer
  contentType?: string
}[] {
  if (!attachments?.length) return []
  return attachments.map((a) => {
    let content: Buffer
    try {
      content = Buffer.from(a.content_base64, "base64")
    } catch {
      throw new Error(`InvalidAttachment: ${a.filename} is not valid base64`)
    }
    if (!content.length) throw new Error(`InvalidAttachment: ${a.filename} decoded empty`)
    if (content.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`AttachmentTooLarge: ${a.filename} exceeds 5 MiB`)
    }
    return {
      filename: a.filename,
      content,
      contentType: a.content_type,
    }
  })
}

function formatAddresses(addrs: { address?: string; name?: string }[] | undefined): string[] {
  if (!addrs?.length) return []
  return addrs.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address ?? "")).filter(Boolean)
}

export async function verifyMailConnection(creds: MailCredsOk): Promise<{ login: string; folder_count: number }> {
  return withImapClient(creds, async (client) => {
    const folders = await client.list()
    return { login: creds.login, folder_count: folders.length }
  })
}

export async function listFolders(creds: MailCredsOk): Promise<MailFolder[]> {
  return withImapClient(creds, async (client) => {
    const boxes = await client.list()
    return boxes.map((b) => ({
      path: b.path,
      name: b.name,
      specialUse: b.specialUse,
    }))
  })
}

export async function listMessages(
  creds: MailCredsOk,
  input: { folder: string; limit?: number; since?: string; unseen_only?: boolean },
): Promise<MailListItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  return withImapClient(creds, async (client) => {
    const lock = await client.getMailboxLock(input.folder)
    try {
      const query: Record<string, unknown> = {}
      if (input.since) query.since = new Date(input.since)
      if (input.unseen_only) query.seen = false
      const uids = await client.search(Object.keys(query).length ? query : { all: true })
      if (!uids || uids.length === 0) return []
      const slice = uids.slice(-limit).reverse()
      const out: MailListItem[] = []
      for (const uid of slice) {
        const msg = await client.fetchOne(String(uid), { envelope: true, flags: true }, { uid: true })
        if (!msg) continue
        out.push({
          uid,
          subject: msg.envelope?.subject ?? "",
          from: formatAddresses(msg.envelope?.from),
          to: formatAddresses(msg.envelope?.to),
          date: msg.envelope?.date?.toISOString() ?? "",
          seen: msg.flags?.has("\\Seen") ?? false,
        })
      }
      return out
    } finally {
      lock.release()
    }
  })
}

export async function getMessage(
  creds: MailCredsOk,
  input: { folder: string; uid: number },
): Promise<MailMessage> {
  return withImapClient(creds, async (client) => {
    const lock = await client.getMailboxLock(input.folder)
    try {
      const msg = await client.fetchOne(String(input.uid), { envelope: true, source: true }, { uid: true })
      if (!msg?.source) throw new Error(`MessageNotFound: uid=${input.uid} in folder=${input.folder}`)
      const parsed = await simpleParser(msg.source)
      return {
        uid: input.uid,
        subject: parsed.subject ?? msg.envelope?.subject ?? "",
        from: parsed.from?.value.map((a) => a.address ?? "").filter(Boolean) ?? formatAddresses(msg.envelope?.from),
        to: parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to.flatMap((t) => t.value.map((a) => a.address ?? ""))
            : parsed.to.value.map((a) => a.address ?? "")
          : formatAddresses(msg.envelope?.to),
        cc: parsed.cc
          ? Array.isArray(parsed.cc)
            ? parsed.cc.flatMap((t) => t.value.map((a) => a.address ?? ""))
            : parsed.cc.value.map((a) => a.address ?? "")
          : [],
        date: (parsed.date ?? msg.envelope?.date)?.toISOString() ?? "",
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : undefined,
      }
    } finally {
      lock.release()
    }
  })
}

export async function sendMail(creds: MailCredsOk, input: SendMailInput): Promise<SendMailResult> {
  if (!creds.sendEnabled) {
    throw new Error("SendDisabled: MAIL_SEND_ENABLED=false — отправка отключена в конфиге MCP.")
  }
  if (!input.to.length) throw new Error("NoRecipients: to must contain at least one email.")
  if (input.to.length + (input.cc?.length ?? 0) + (input.bcc?.length ?? 0) > 50) {
    throw new Error("TooManyRecipients: max 50 total recipients.")
  }

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpPort === 465,
    auth: smtpAuth(creds),
  })

  const decoded = decodeAttachments(input.attachments)

  const info = await transporter.sendMail({
    from: creds.login,
    to: input.to.join(", "),
    cc: input.cc?.length ? input.cc.join(", ") : undefined,
    bcc: input.bcc?.length ? input.bcc.join(", ") : undefined,
    subject: input.subject,
    text: input.text,
    attachments: decoded.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  return {
    message_id: info.messageId ?? "",
    accepted: (info.accepted as string[]) ?? [],
    rejected: (info.rejected as string[]) ?? [],
    attachment_names: decoded.map((a) => a.filename),
  }
}
