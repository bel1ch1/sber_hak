// google-config.ts — OAuth credentials (shared with gmail-mcp naming)

import fs from "node:fs/promises"
import path from "node:path"

export type GoogleCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  userEmail?: string
  calendarId: string
}

export type CredsResult =
  | { ok: true; creds: GoogleCredentials }
  | { ok: false; diagnostic: string }

export function resolveWorkspaceRoot(packageDir: string): string {
  return path.resolve(packageDir, "..", "..")
}

async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const out: Record<string, string> = {}
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq <= 0) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

export async function loadPackageEnv(packageDir: string): Promise<void> {
  // Prefer local .env; also load sibling gmail-mcp/.env for shared OAuth without duplicating secrets.
  const files = [
    path.join(packageDir, ".env"),
    path.join(packageDir, "..", "gmail-mcp", ".env"),
  ]
  for (const file of files) {
    const parsed = await readEnvFile(file)
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v
    }
  }
}

function pick(env: Record<string, string | undefined>, ...keys: string[]): string {
  for (const k of keys) {
    const v = env[k]?.trim()
    if (v) return v
  }
  return ""
}

export async function readGoogleCredentials(
  workspaceRoot: string,
  packageDir: string,
): Promise<CredsResult> {
  await loadPackageEnv(packageDir)
  const pkg = await readEnvFile(path.join(packageDir, ".env"))
  const gmail = await readEnvFile(path.join(packageDir, "..", "gmail-mcp", ".env"))
  const root = await readEnvFile(path.join(workspaceRoot, ".env"))
  const env = { ...root, ...gmail, ...pkg, ...process.env }

  const clientId = pick(env, "GMAIL_CLIENT_ID", "GOOGLE_CLIENT_ID")
  const clientSecret = pick(env, "GMAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET")
  const refreshToken = pick(env, "GMAIL_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN")
  const userEmail = pick(env, "GMAIL_USER", "GOOGLE_USER") || undefined
  const calendarId = pick(env, "GOOGLE_CALENDAR_ID") || "primary"

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId && "GMAIL_CLIENT_ID",
      !clientSecret && "GMAIL_CLIENT_SECRET",
      !refreshToken && "GMAIL_REFRESH_TOKEN",
    ].filter(Boolean)
    return {
      ok: false,
      diagnostic:
        `Missing: ${missing.join(", ")}. ` +
        "Use the same OAuth Desktop client as gmail-mcp; re-run auth with calendar scopes " +
        "(npm run auth in mcp/gmail-mcp or mcp/google-calendar-mcp).",
    }
  }

  return {
    ok: true,
    creds: { clientId, clientSecret, refreshToken, userEmail, calendarId },
  }
}

export function formatNoCredentialsError(diagnostic: string): string {
  return `Google Calendar credentials not configured. ${diagnostic}`
}

/** Mail + Calendar scopes — one refresh token for both MCP servers. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
]
