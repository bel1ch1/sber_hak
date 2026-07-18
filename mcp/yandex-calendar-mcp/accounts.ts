// accounts.ts — id → email directory for calendar attendees (PII stays in MCP).
import { readFile } from "node:fs/promises"
import path from "node:path"

export type CalendarAccount = { id: string; email: string; label: string }

export type AccountDirectory = {
  byId: Map<string, CalendarAccount>
  byEmail: Map<string, string>
}

export function obfuscationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.CALENDAR_OBFUSCATION ?? "true").trim().toLowerCase()
  return !["0", "false", "no", "off"].includes(v)
}

export function accountsCsvPath(packageDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CALENDAR_ACCOUNTS_CSV?.trim()
  return raw || path.join(packageDir, "accounts.csv")
}

export function parseAccountsCsv(text: string): AccountDirectory {
  const byId = new Map<string, CalendarAccount>()
  const byEmail = new Map<string, string>()
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
    if (!id || !email.includes("@")) continue
    byId.set(id, { id, email, label })
    byEmail.set(email, id)
  }
  return { byId, byEmail }
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
    return { byId: new Map(), byEmail: new Map() }
  }
}

/** Resolve opaque ids → emails. Rejects raw emails when obfuscation is on. */
export function resolveAttendeeIds(
  dir: AccountDirectory,
  ids: string[],
): { emails: string[]; unknown: string[] } {
  const emails: string[] = []
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
    else emails.push(acc.email)
  }
  return { emails, unknown }
}

export function maskEmail(dir: AccountDirectory, email: string): string {
  const e = (email || "").trim().toLowerCase()
  if (!e) return "(hidden)"
  return dir.byEmail.get(e) ?? `ext_${simpleHash(e)}`
}

function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, "0").slice(0, 8)
}
