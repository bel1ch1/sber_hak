// yandex-wiki-schemas.ts — shared Zod schemas for Yandex Wiki MCP tools.
import { z } from "zod"

export const PageIdentityInput = z
  .object({
    page_id: z.number().int().positive().optional(),
    slug: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.page_id) || Boolean(v.slug), {
    message: "Either page_id or slug is required",
  })

export const PageFieldsInput = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : "attributes,content,breadcrumbs"))

export const CreatePageInput = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1),
  content: z.string().optional().default(""),
})

export const UpdatePagePatchInput = z
  .object({
    title: z.string().min(1).max(255).optional(),
    content: z.string().optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "At least one of title or content must be provided",
  })

export const AppendContentInput = z.object({
  page_id: z.number().int().positive(),
  content: z.string().min(1),
  location: z.enum(["top", "bottom"]).optional().default("bottom"),
})

export const ListDescendantsInput = z.object({
  slug: z.string().min(1),
  page_size: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
  include_self: z.boolean().optional().default(false),
})

export type PageIdentity = z.infer<typeof PageIdentityInput>
export type CreatePageArgs = z.infer<typeof CreatePageInput>
export type UpdatePagePatch = z.infer<typeof UpdatePagePatchInput>
export type AppendContentArgs = z.infer<typeof AppendContentInput>
export type ListDescendantsArgs = z.infer<typeof ListDescendantsInput>
