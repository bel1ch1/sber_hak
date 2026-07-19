// gmail-schemas.ts — Zod inputs aligned with yandex-mail-mcp tool contract

import { z } from "zod"

export const ListMessagesInput = z.object({
  folder: z.string().min(1).max(500).default("INBOX"),
  limit: z.number().int().min(1).max(100).default(20),
  since: z.string().optional(),
  unseen_only: z.boolean().optional(),
})

export const GetMessageInput = z.object({
  folder: z.string().min(1).max(500).default("INBOX"),
  /** Gmail message id (string). Kept as `uid` for pipeline compatibility with IMAP skills. */
  uid: z.union([z.string().min(1).max(200), z.number().int().positive()]),
})

const Attachment = z.object({
  filename: z.string().min(1).max(200),
  content_base64: z.string().min(1).max(7_000_000),
  content_type: z.string().min(3).max(120).optional(),
})

export const SendMailInput = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(100_000),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  attachments: z.array(Attachment).max(3).optional(),
})

export const SendMailByIdInput = z.object({
  to: z.array(z.string().min(1).max(64)).min(1).max(50),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(100_000),
  cc: z.array(z.string().min(1).max(64)).max(50).optional(),
  bcc: z.array(z.string().min(1).max(64)).max(50).optional(),
  attachments: z.array(Attachment).max(3).optional(),
})

export type ListMessagesArgs = z.infer<typeof ListMessagesInput>
export type GetMessageArgs = z.infer<typeof GetMessageInput>
export type SendMailArgs = z.infer<typeof SendMailInput>
