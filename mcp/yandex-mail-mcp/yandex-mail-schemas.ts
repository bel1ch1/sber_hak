// yandex-mail-schemas.ts
import { z } from "zod"

export const FolderInput = z.object({
  folder: z.string().min(1).max(500).default("INBOX"),
})

export const ListMessagesInput = z.object({
  folder: z.string().min(1).max(500).default("INBOX"),
  limit: z.number().int().min(1).max(100).optional(),
  since: z.string().optional(),
  unseen_only: z.boolean().optional(),
})

export const GetMessageInput = z.object({
  folder: z.string().min(1).max(500).default("INBOX"),
  uid: z.number().int().positive(),
})

export const SendMailInput = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(100_000),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
})
