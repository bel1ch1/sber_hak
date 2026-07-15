// yandex-wiki-client.ts — HTTP client for Yandex Wiki Public API.
import type { WikiAuthMode, WikiCredentials } from "./yandex-wiki.ts"
import type { AppendContentArgs, CreatePageArgs, ListDescendantsArgs, UpdatePagePatch } from "./yandex-wiki-schemas.ts"

export type WikiClientContext = Extract<WikiCredentials, { ok: true }>

export type WikiPageSummary = {
  id: number
  slug: string
  title?: string
  page_type?: string
  content?: string
  breadcrumbs?: Array<{ id: number; title: string; slug: string; page_exists?: boolean }>
  attributes?: Record<string, unknown>
}

export type WikiDescendantsResult = {
  results: Array<{ id: number; slug: string }>
  next_cursor?: string | null
  prev_cursor?: string | null
}

export class WikiApiError extends Error {
  readonly status: number
  readonly errorCode?: string
  readonly details?: unknown

  constructor(message: string, status: number, errorCode?: string, details?: unknown) {
    super(message)
    this.name = "WikiApiError"
    this.status = status
    this.errorCode = errorCode
    this.details = details
  }
}

function authHeaderValue(ctx: WikiClientContext): string {
  return ctx.authMode === "iam" ? `Bearer ${ctx.token}` : `OAuth ${ctx.token}`
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "")
  return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`
}

async function parseErrorBody(res: Response): Promise<{ message: string; errorCode?: string; details?: unknown }> {
  const text = await res.text()
  try {
    const body = JSON.parse(text) as {
      debug_message?: string
      error_code?: string
      details?: unknown
    }
    return {
      message: body.debug_message || text || res.statusText,
      errorCode: body.error_code,
      details: body.details,
    }
  } catch {
    return { message: text || res.statusText }
  }
}

export async function wikiRequest<T>(
  ctx: WikiClientContext,
  method: string,
  apiPath: string,
  opts?: {
    query?: Record<string, string | number | boolean | undefined>
    body?: unknown
    timeoutMs?: number
  },
): Promise<T> {
  const url = new URL(joinUrl(ctx.apiBaseUrl, apiPath))
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue
      url.searchParams.set(k, String(v))
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000)
  try {
    const headers: Record<string, string> = {
      Authorization: authHeaderValue(ctx),
      [ctx.orgHeader]: ctx.orgId,
      Accept: "application/json",
    }
    if (opts?.body !== undefined) headers["Content-Type"] = "application/json"

    const res = await fetch(url, {
      method,
      headers,
      body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await parseErrorBody(res)
      throw new WikiApiError(
        `Wiki API ${method} ${apiPath} failed (${res.status}): ${err.message}`,
        res.status,
        err.errorCode,
        err.details,
      )
    }

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof WikiApiError) throw e
    if (e instanceof Error && e.name === "AbortError") {
      throw new WikiApiError(`Wiki API ${method} ${apiPath} timed out`, 408)
    }
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

export async function getPageBySlug(
  ctx: WikiClientContext,
  slug: string,
  fields = "attributes,content,breadcrumbs",
): Promise<WikiPageSummary> {
  return wikiRequest<WikiPageSummary>(ctx, "GET", "/v1/pages", {
    query: { slug, fields },
  })
}

export async function getPageById(
  ctx: WikiClientContext,
  pageId: number,
  fields = "attributes,content,breadcrumbs",
): Promise<WikiPageSummary> {
  return wikiRequest<WikiPageSummary>(ctx, "GET", `/v1/pages/${pageId}`, {
    query: { fields },
  })
}

export async function listDescendants(
  ctx: WikiClientContext,
  input: ListDescendantsArgs,
): Promise<WikiDescendantsResult> {
  return wikiRequest<WikiDescendantsResult>(ctx, "GET", "/v1/pages/descendants", {
    query: {
      slug: input.slug,
      page_size: input.page_size,
      cursor: input.cursor,
      include_self: input.include_self,
      actuality: "actual",
    },
  })
}

export async function createPage(
  ctx: WikiClientContext,
  input: CreatePageArgs,
): Promise<WikiPageSummary> {
  return wikiRequest<WikiPageSummary>(ctx, "POST", "/v1/pages", {
    query: { is_silent: true },
    body: {
      title: input.title,
      slug: input.slug,
      content: input.content ?? "",
      access_policy: {
        access_type: "inherited",
        all_staff_role: "reader",
      },
    },
  })
}

export async function updatePage(
  ctx: WikiClientContext,
  pageId: number,
  patch: UpdatePagePatch,
): Promise<WikiPageSummary> {
  const body: Record<string, string> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.content !== undefined) body.content = patch.content
  return wikiRequest<WikiPageSummary>(ctx, "POST", `/v1/pages/${pageId}`, {
    query: { is_silent: true, allow_merge: true },
    body,
  })
}

export async function appendContent(
  ctx: WikiClientContext,
  input: AppendContentArgs,
): Promise<WikiPageSummary> {
  return wikiRequest<WikiPageSummary>(ctx, "POST", `/v1/pages/${input.page_id}/append-content`, {
    query: { is_silent: true },
    body: {
      content: input.content,
      body: { location: input.location },
    },
  })
}

export function assertWritable(ctx: WikiClientContext): void {
  if (ctx.readOnly) {
    throw new WikiApiError("WIKI_READ_ONLY=true: write tools are disabled on this MCP server", 403, "READ_ONLY")
  }
}

export function summarizePage(page: WikiPageSummary) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    page_type: page.page_type,
    content: page.content,
    breadcrumbs: page.breadcrumbs,
    attributes: page.attributes,
  }
}
