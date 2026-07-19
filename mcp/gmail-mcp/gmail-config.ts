// gmail-config.ts — load OAuth credentials from package / workspace .env

import fs from "node:fs/promises"
import path from "node:path"

export type GmailCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  userEmail?: string
}

export type CredsResult =
  | { ok: true; creds: GmailCredentials }
  | { ok: false; diagnostic: string }

export function resolveWorkspaceRoot(packageDir: string): string {
  // mcp/gmail-mcp -> repo root
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

/** Load package .env into process.env without overriding existing keys. */
export async function loadPackageEnv(packageDir: string): Promise<void> {
  const file = path.join(packageDir, ".env")
  const parsed = await readEnvFile(file)
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function pick(env: Record<string, string | undefined>, ...keys: string[]): string {
  for (const k of keys) {
    const v = env[k]?.trim()
    if (v) return v
  }
  return ""
}

export async function readGmailCredentials(
  workspaceRoot: string,
  packageDir: string,
): Promise<CredsResult> {
  const pkg = await readEnvFile(path.join(packageDir, ".env"))
  const root = await readEnvFile(path.join(workspaceRoot, ".env"))
  const env = { ...root, ...pkg, ...process.env }

  const clientId = pick(env, "GMAIL_CLIENT_ID", "GOOGLE_CLIENT_ID")
  const clientSecret = pick(env, "GMAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET")
  const refreshToken = pick(env, "GMAIL_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN")
  const userEmail = pick(env, "GMAIL_USER", "GMAIL_LOGIN") || undefined

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
        "Create OAuth Desktop client in Google Cloud Console, enable Gmail API, " +
        "then run `npm run auth` in mcp/gmail-mcp (see SETUP_GMAIL.md).",
    }
  }

  return {
    ok: true,
    creds: { clientId, clientSecret, refreshToken, userEmail },
  }
}

export function formatNoCredentialsError(diagnostic: string): string {
  return `Gmail credentials not configured. ${diagnostic}`
}

export function isSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.MAIL_SEND_ENABLED ?? "true").trim().toLowerCase()
  return v !== "false" && v !== "0" && v !== "no" && v !== "off"
}
