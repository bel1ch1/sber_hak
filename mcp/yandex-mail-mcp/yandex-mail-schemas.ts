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

// Obfuscated variant: recipients are opaque IDs, never email addresses.
// A value containing "@" is rejected so the agent can't smuggle a raw address
// past the PII boundary.
export const RecipientId = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !v.includes("@"), { message: "pass a recipient id (e.g. usr_a1b2c3 or self), not an email address" })

export const SendMailByIdInput = z.object({
  to: z.array(RecipientId).min(1).max(50),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(100_000),
  cc: z.array(RecipientId).max(50).optional(),
  bcc: z.array(RecipientId).max(50).optional(),
})
