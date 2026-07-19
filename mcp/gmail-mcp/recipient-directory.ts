// recipient-directory.ts — the curated "CSV dataset" that lives *inside* the MCP.
//
// Purpose (data obfuscation): the agent only ever handles opaque recipient IDs.
// The real email addresses live here, in a CSV the MCP reads server-side, and
// never cross the boundary to the agent / the LLM. Onboarding a new hire = add
// one row (id,email,label) to the CSV; the agent keeps talking in IDs.
//
// CSV format (header optional, `#` comments and blank lines ignored):
//   id,email,label
//   usr_a1b2c3,ivan.petrov@yandex.ru,Ivan Petrov (mentor)

import { readFile } from "node:fs/promises"

export interface RecipientEntry {
  /** Opaque, meaningless id the agent sees (e.g. "usr_a1b2c3"). */
  id: string
  /** Real address — server-side only, never exposed to the agent. */
  email: string
  /** Human-readable note for the directory maintainer. Never sent to the agent. */
  label?: string
}

export interface RecipientDirectory {
  /** id -> entry */
  byId: Map<string, RecipientEntry>
  /** lowercased email -> id */
  byEmail: Map<string, string>
  entries: RecipientEntry[]
  warnings: string[]
  source: string
}

/** Splits one CSV line, honoring double-quoted fields that may contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map((f) => f.trim())
}

function isHeaderRow(fields: string[]): boolean {
  return (fields[0] ?? "").toLowerCase() === "id"
}

/** Pure parser — no I/O. Testable in isolation. */
export function parseRecipientsCsv(raw: string, source = "(inline)"): RecipientDirectory {
  const byId = new Map<string, RecipientEntry>()
  const byEmail = new Map<string, string>()
  const entries: RecipientEntry[] = []
  const warnings: string[] = []

  const lines = raw.split(/\r?\n/)
  let seenDataOrHeader = false
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]
    const t = line.trim()
    if (!t || t.startsWith("#")) continue

    const fields = splitCsvLine(line)
    if (!seenDataOrHeader && isHeaderRow(fields)) {
      seenDataOrHeader = true
      continue
    }
    seenDataOrHeader = true

    const id = (fields[0] ?? "").trim()
    const email = (fields[1] ?? "").trim()
    const label = (fields[2] ?? "").trim() || undefined
    if (!id || !email) {
      warnings.push(`${source}:${n + 1}: skipped row without id/email`)
      continue
    }
    if (!email.includes("@")) {
      warnings.push(`${source}:${n + 1}: skipped id="${id}" — "${email}" is not an email`)
      continue
    }
    if (byId.has(id)) {
      warnings.push(`${source}:${n + 1}: duplicate id="${id}" — later row overrides`)
    }
    const entry: RecipientEntry = { id, email, label }
    byId.set(id, entry)
    const key = email.toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, id)
    entries.push(entry)
  }

  return { byId, byEmail, entries, warnings, source }
}

/** Reads + parses the CSV. A missing file yields an empty directory (not an error). */
export async function loadRecipientDirectory(csvPath: string): Promise<RecipientDirectory> {
  let raw: string
  try {
    raw = await readFile(csvPath, "utf8")
  } catch {
    return {
      byId: new Map(),
      byEmail: new Map(),
      entries: [],
      warnings: [`recipient directory not found at ${csvPath} — send will fail until it exists`],
      source: csvPath,
    }
  }
  return parseRecipientsCsv(raw, csvPath)
}
