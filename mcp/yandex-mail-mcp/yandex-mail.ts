// yandex-mail.ts — credential resolution for Yandex Mail (IMAP/SMTP).
import { readFile } from "node:fs/promises"
import path from "node:path"

const PLACEHOLDERS = new Set([
  "PASTE_YOUR_OAUTH_TOKEN_HERE",
  "PASTE_YOUR_MAIL_OAUTH_TOKEN_HERE",
  "PASTE_YOUR_APP_PASSWORD_HERE",
  "PASTE_YOUR_MAIL_APP_PASSWORD_HERE",
])

const DEFAULT_IMAP_HOST = "imap.yandex.com"
const DEFAULT_IMAP_PORT = 993
const DEFAULT_SMTP_HOST = "smtp.yandex.com"
const DEFAULT_SMTP_PORT = 465

function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const sep = t.indexOf("=")
    if (sep === -1) continue
    const k = t.slice(0, sep).trim()
    let v = t.slice(sep + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

type EnvState = "absent" | "placeholder" | "present-but-empty" | "set"
type FileCheck = { path: string; state: "no-file" | "no-creds" | "placeholder" | "empty" | "found" }

export type MailAuthMode = "oauth" | "password"

export type MailCredentials =
  | {
      ok: true
      login: string
      authMode: MailAuthMode
      oauthToken?: string
      appPassword?: string
      imapHost: string
      imapPort: number
      smtpHost: string
      smtpPort: number
      sendEnabled: boolean
      source: string
    }
  | {
      ok: false
      diagnostic: {
        workspaceDir: string
        processEnvLogin: EnvState
        processEnvOAuth: EnvState
        processEnvPassword: EnvState
        checks: FileCheck[]
      }
    }

function classifyEnv(raw: string | undefined): EnvState {
  if (raw === undefined) return "absent"
  const t = raw.trim()
  if (t === "") return "present-but-empty"
  if (PLACEHOLDERS.has(t)) return "placeholder"
  return "set"
}

function getHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || ""
}

export function resolveWorkspaceRoot(packageDir: string): string {
  const parent = path.dirname(packageDir)
  if (path.basename(parent) === "mcp") return path.dirname(parent)
  if (path.basename(parent) === "mcp_servers") {
    const grandparent = path.dirname(parent)
    if (path.basename(grandparent) === ".opencode") return path.dirname(grandparent)
    return grandparent
  }
  return path.resolve(packageDir, "..", "..")
}

export function buildCandidatePaths(workspaceDir: string, packageDir?: string): string[] {
  const paths: string[] = []
  if (packageDir) paths.push(path.join(packageDir, ".env"))
  if (workspaceDir && workspaceDir !== "/" && workspaceDir !== "\\") {
    paths.push(path.join(workspaceDir, ".opencode", ".env"))
  }
  const home = getHomeDir()
  if (home) {
    paths.push(path.join(home, ".config", "opencode", ".env"))
    paths.push(path.join(home, ".openwork", ".env"))
  }
  return paths
}

function normalizeSendEnabled(raw: string | undefined): boolean {
  const v = (raw ?? "true").trim().toLowerCase()
  if (v === "0" || v === "false" || v === "no" || v === "off") return false
  return true
}

function pickAuth(values: Record<string, string>): { authMode: MailAuthMode; oauthToken?: string; appPassword?: string } | null {
  const oauth = values.YANDEX_MAIL_OAUTH_TOKEN?.trim()
  if (oauth && !PLACEHOLDERS.has(oauth)) {
    return { authMode: "oauth", oauthToken: oauth }
  }
  const pass = values.YANDEX_MAIL_APP_PASSWORD?.trim()
  if (pass && !PLACEHOLDERS.has(pass)) {
    return { authMode: "password", appPassword: pass }
  }
  return null
}

function credentialsFromValues(values: Record<string, string>, source: string): MailCredentials | null {
  const login = values.YANDEX_MAIL_LOGIN?.trim()
  if (!login || PLACEHOLDERS.has(login)) return null
  const auth = pickAuth(values)
  if (!auth) return null
  const imapPort = Number(values.YANDEX_MAIL_IMAP_PORT ?? DEFAULT_IMAP_PORT)
  const smtpPort = Number(values.YANDEX_MAIL_SMTP_PORT ?? DEFAULT_SMTP_PORT)
  if (!Number.isInteger(imapPort) || !Number.isInteger(smtpPort)) return null
  return {
    ok: true,
    login,
    authMode: auth.authMode,
    oauthToken: auth.oauthToken,
    appPassword: auth.appPassword,
    imapHost: values.YANDEX_MAIL_IMAP_HOST?.trim() || DEFAULT_IMAP_HOST,
    imapPort,
    smtpHost: values.YANDEX_MAIL_SMTP_HOST?.trim() || DEFAULT_SMTP_HOST,
    smtpPort,
    sendEnabled: normalizeSendEnabled(values.MAIL_SEND_ENABLED),
    source,
  }
}

async function checkEnvFile(p: string): Promise<{ check: FileCheck; values?: Record<string, string> }> {
  let raw: string
  try {
    raw = await readFile(p, "utf8")
  } catch {
    return { check: { path: p, state: "no-file" } }
  }
  const v = parseDotEnv(raw)
  const login = v.YANDEX_MAIL_LOGIN?.trim()
  const auth = pickAuth(v)
  if (!login && !auth) return { check: { path: p, state: "no-creds" } }
  if (!login || !auth) return { check: { path: p, state: "no-creds" } }
  if (login === "" || (auth.authMode === "oauth" && !auth.oauthToken) || (auth.authMode === "password" && !auth.appPassword)) {
    return { check: { path: p, state: "empty" } }
  }
  if (PLACEHOLDERS.has(login)) return { check: { path: p, state: "placeholder" } }
  return { check: { path: p, state: "found" }, values: v }
}

export async function loadPackageEnv(packageDir: string): Promise<void> {
  const envPath = path.join(packageDir, ".env")
  let raw: string
  try {
    raw = await readFile(envPath, "utf8")
  } catch {
    return
  }
  const fromFile = parseDotEnv(raw)
  for (const [k, v] of Object.entries(fromFile)) {
    const shell = process.env[k]
    if (shell === undefined || shell.trim() === "") {
      process.env[k] = v.trim()
    }
  }
}

export async function readMailCredentials(
  workspaceDir: string,
  packageDir?: string,
): Promise<MailCredentials> {
  const loginState = classifyEnv(process.env.YANDEX_MAIL_LOGIN)
  const oauthState = classifyEnv(process.env.YANDEX_MAIL_OAUTH_TOKEN)
  const passState = classifyEnv(process.env.YANDEX_MAIL_APP_PASSWORD)

  if (loginState === "set" && (oauthState === "set" || passState === "set")) {
    const fromEnv = credentialsFromValues(process.env as Record<string, string>, "process.env")
    if (fromEnv?.ok) return fromEnv
  }

  const candidates = buildCandidatePaths(workspaceDir, packageDir)
  const checks: FileCheck[] = []
  for (const p of candidates) {
    const { check, values } = await checkEnvFile(p)
    checks.push(check)
    if (check.state === "found" && values) {
      const creds = credentialsFromValues(values, p)
      if (creds?.ok) return creds
    }
  }

  return {
    ok: false,
    diagnostic: {
      workspaceDir,
      processEnvLogin: loginState,
      processEnvOAuth: oauthState,
      processEnvPassword: passState,
      checks,
    },
  }
}

export function formatNoCredentialsError(d: {
  workspaceDir: string
  processEnvLogin: EnvState
  processEnvOAuth: EnvState
  processEnvPassword: EnvState
  checks: FileCheck[]
}): string {
  const lines: string[] = [
    "Учётные данные Яндекс Почты не найдены.",
    "Нужны YANDEX_MAIL_LOGIN и один из способов авторизации:",
    "  YANDEX_MAIL_OAUTH_TOKEN — OAuth (scopes mail:imap_ro + mail:smtp)",
    "  YANDEX_MAIL_APP_PASSWORD — пароль приложения (IMAP/SMTP включены в настройках почты)",
    "",
    "Диагностика:",
    `  workspaceDir                          = ${d.workspaceDir || "(empty)"}`,
    `  process.env.YANDEX_MAIL_LOGIN         = ${d.processEnvLogin}`,
    `  process.env.YANDEX_MAIL_OAUTH_TOKEN   = ${d.processEnvOAuth}`,
    `  process.env.YANDEX_MAIL_APP_PASSWORD  = ${d.processEnvPassword}`,
    "  Проверены пути в порядке приоритета:",
  ]
  for (const c of d.checks) {
    lines.push(`    [${c.state.padEnd(11)}] ${c.path}`)
  }
  lines.push("")
  lines.push(
    "Рекомендация: положить креды в mcp/yandex-mail-mcp/.env (см. .env.example) и перезапустить MCP-сервер.",
  )
  return lines.join("\n")
}
