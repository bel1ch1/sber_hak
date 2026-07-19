// accounts.ts — id ↔ email/login directory for calendar (PII stays in MCP).
import { readFile } from "node:fs/promises"
import path from "node:path"

export type CalendarAccount = {
  id: string
  email: string
  /** Human-readable name shown in Google Calendar (CN / displayName). */
  login: string
  label: string
}

export type AccountDirectory = {
  byId: Map<string, CalendarAccount>
  byEmail: Map<string, string>
  byLogin: Map<string, string>
  entries: CalendarAccount[]
}

export function obfuscationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.CALENDAR_OBFUSCATION ?? "true").trim().toLowerCase()
  return !["0", "false", "no", "off"].includes(v)
}

export function accountsCsvPath(packageDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CALENDAR_ACCOUNTS_CSV?.trim()
  return raw || path.join(packageDir, "accounts.csv")
}

function deriveLogin(email: string, label: string, loginCol: string): string {
  const fromCol = loginCol.trim()
  if (fromCol) return fromCol
  const fromLabel = label.trim()
  if (fromLabel) return fromLabel
  const local = email.split("@")[0]?.trim()
  return local || email
}

export function parseAccountsCsv(text: string): AccountDirectory {
  const byId = new Map<string, CalendarAccount>()
  const byEmail = new Map<string, string>()
  const byLogin = new Map<string, string>()
  const entries: CalendarAccount[] = []
  const lines = text.split(/\r?\n/)
  let start = 0
  if (lines[0] && /^id\s*,/i.test(lines[0])) start = 1
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith("#")) continue
    const cols = splitCsvLine(line)
    const id = (cols[0] || "").trim()
    const email = (cols[1] || "").trim().toLowerCase()
    const label = (cols[2] || "").trim()
    const login = deriveLogin(email, label, cols[3] || "")
    if (!id || !email.includes("@")) continue
    const acc: CalendarAccount = { id, email, login, label }
    byId.set(id, acc)
    // First id wins for shared-mailbox demos (stable reverse mask).
    if (!byEmail.has(email)) byEmail.set(email, id)
    const loginKey = login.toLowerCase()
    if (loginKey && !byLogin.has(loginKey)) byLogin.set(loginKey, id)
    entries.push(acc)
  }
  return { byId, byEmail, byLogin, entries }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (c === "," && !q) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

export async function loadAccounts(csvPath: string): Promise<AccountDirectory> {
  try {
    const text = await readFile(csvPath, "utf8")
    return parseAccountsCsv(text)
  } catch {
    return { byId: new Map(), byEmail: new Map(), byLogin: new Map(), entries: [] }
  }
}

export type ResolvedAttendee = { email: string; displayName: string; id: string }

/** Resolve opaque ids → email + displayName (login). Rejects raw emails when obfuscation is on. */
export function resolveAttendeeIds(
  dir: AccountDirectory,
  ids: string[],
): { attendees: ResolvedAttendee[]; unknown: string[] } {
  const attendees: ResolvedAttendee[] = []
  const unknown: string[] = []
  for (const raw of ids) {
    const id = (raw || "").trim()
    if (!id) continue
    if (id.includes("@")) {
      unknown.push(id)
      continue
    }
    const acc = dir.byId.get(id)
    if (!acc) unknown.push(id)
    else attendees.push({ email: acc.email, displayName: acc.login, id: acc.id })
  }
  return { attendees, unknown }
}

export function maskEmail(dir: AccountDirectory, email: string): string {
  const e = (email || "").trim().toLowerCase()
  if (!e) return "(hidden)"
  return dir.byEmail.get(e) ?? `ext_${simpleHash(e)}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Expand opaque ids in free text to human-readable login before writing to Google Calendar.
 * Agent keeps writing ids; calendar UI shows names/logins.
 */
export function expandIdsInText(dir: AccountDirectory, text: string): string {
  if (!text) return text
  const pairs = dir.entries
    .map((e) => ({ id: e.id, login: e.login }))
    .sort((a, b) => b.id.length - a.id.length)
  let out = text
  for (const { id, login } of pairs) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(id)}(?![A-Za-z0-9_])`, "g")
    out = out.replace(re, login)
  }
  return out
}

/**
 * Mask emails and logins in free text back to opaque ids (for agent-facing reads).
 * Longer tokens first so partial overlaps don't break.
 */
export function maskText(dir: AccountDirectory, text: string): string {
  if (!text) return text
  const pairs: Array<{ from: string; to: string }> = []
  for (const e of dir.entries) {
    pairs.push({ from: e.email, to: e.id })
    if (e.login && e.login.toLowerCase() !== e.email) {
      pairs.push({ from: e.login, to: e.id })
    }
    if (e.label && e.label !== e.login && e.label.toLowerCase() !== e.email) {
      pairs.push({ from: e.label, to: e.id })
    }
  }
  pairs.sort((a, b) => b.from.length - a.from.length)

  let out = text
  for (const { from, to } of pairs) {
    if (from.includes("@")) {
      const re = new RegExp(
        `(?<![A-Za-z0-9._%+-])${escapeRegExp(from)}(?![A-Za-z0-9._%+-])`,
        "gi",
      )
      out = out.replace(re, to)
    } else {
      const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(from)}(?![A-Za-z0-9_])`, "gi")
      out = out.replace(re, to)
    }
  }
  return out
}

export function maskEventFields<
  T extends {
    attendees: string[]
    title?: string
    description?: string
    location?: string
    attendee_ids?: string[]
  },
>(dir: AccountDirectory, events: T[]): T[] {
  return events.map((e) => {
    const attendees =
      e.attendee_ids?.length
        ? e.attendee_ids
        : e.attendees.map((a) => maskEmail(dir, a))
    const { attendee_ids: _drop, ...rest } = e
    return {
      ...rest,
      attendees,
      ...(typeof e.title === "string" ? { title: maskText(dir, e.title) } : {}),
      ...(typeof e.description === "string" ? { description: maskText(dir, e.description) } : {}),
      ...(typeof e.location === "string" ? { location: maskText(dir, e.location) } : {}),
    } as T
  })
}

function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, "0").slice(0, 8)
}
