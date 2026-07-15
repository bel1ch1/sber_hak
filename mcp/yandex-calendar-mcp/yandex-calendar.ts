// yandex-calendar.ts — credential resolution (Node.js, no Bun).
import { readFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_CALDAV_URL = "https://caldav.yandex.ru/"

const PLACEHOLDERS = new Set([
  "PASTE_YOUR_YANDEX_LOGIN_HERE",
  "PASTE_YOUR_YANDEX_APP_PASSWORD_HERE",
])

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

function classifyEnv(raw: string | undefined): EnvState {
  if (raw === undefined) return "absent"
  const t = raw.trim()
  if (t === "") return "present-but-empty"
  if (PLACEHOLDERS.has(t)) return "placeholder"
  return "set"
}

type FileCheck = { path: string; state: "no-file" | "no-creds" | "placeholder" | "empty" | "found" }

export type CredentialsLookup =
  | {
      ok: true
      login: string
      password: string
      caldavUrl: string
      calendarUrl?: string
      source: string
    }
  | {
      ok: false
      diagnostic: {
        workspaceDir: string
        processEnvLogin: EnvState
        processEnvPassword: EnvState
        checks: FileCheck[]
      }
    }

function getHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || ""
}

/** `<ws>/mcp_servers/<pkg>` → ws; `<ws>/.opencode/mcp_servers/<pkg>` → ws. */
export function resolveWorkspaceRoot(packageDir: string): string {
  const mcpServers = path.dirname(packageDir)
  if (path.basename(mcpServers) !== "mcp_servers") {
    return path.resolve(packageDir, "..", "..")
  }
  const parent = path.dirname(mcpServers)
  if (path.basename(parent) === ".opencode") {
    return path.dirname(parent)
  }
  return parent
}

export function buildCandidatePaths(workspaceDir: string, packageDir?: string): string[] {
  const paths: string[] = []
  if (packageDir) {
    paths.push(path.join(packageDir, ".env"))
  }
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

async function checkEnvFile(p: string): Promise<{ check: FileCheck; values?: Record<string, string> }> {
  let raw: string
  try {
    raw = await readFile(p, "utf8")
  } catch {
    return { check: { path: p, state: "no-file" } }
  }
  const v = parseDotEnv(raw)
  const login = v.YANDEX_LOGIN
  const pass = v.YANDEX_APP_PASSWORD

  if (login === undefined && pass === undefined) return { check: { path: p, state: "no-creds" } }
  if (login === undefined || pass === undefined) return { check: { path: p, state: "no-creds" } }
  if (login.trim() === "" || pass.trim() === "") return { check: { path: p, state: "empty" } }
  if (PLACEHOLDERS.has(login.trim()) || PLACEHOLDERS.has(pass.trim())) {
    return { check: { path: p, state: "placeholder" } }
  }
  return { check: { path: p, state: "found" }, values: v }
}

/** Apply package `.env` to `process.env` (shell env wins). */
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

export async function readYandexCredentials(
  workspaceDir: string,
  packageDir?: string,
): Promise<CredentialsLookup> {
  const loginState = classifyEnv(process.env.YANDEX_LOGIN)
  const passState = classifyEnv(process.env.YANDEX_APP_PASSWORD)

  if (loginState === "set" && passState === "set") {
    return {
      ok: true,
      login: process.env.YANDEX_LOGIN!.trim(),
      password: process.env.YANDEX_APP_PASSWORD!.trim(),
      caldavUrl: process.env.YANDEX_CALDAV_URL?.trim() || DEFAULT_CALDAV_URL,
      calendarUrl: process.env.YANDEX_CALDAV_CALENDAR_URL?.trim() || undefined,
      source: "process.env",
    }
  }

  const candidates = buildCandidatePaths(workspaceDir, packageDir)
  const checks: FileCheck[] = []
  for (const p of candidates) {
    const { check, values } = await checkEnvFile(p)
    checks.push(check)
    if (check.state === "found" && values) {
      return {
        ok: true,
        login: values.YANDEX_LOGIN!.trim(),
        password: values.YANDEX_APP_PASSWORD!.trim(),
        caldavUrl: values.YANDEX_CALDAV_URL?.trim() || DEFAULT_CALDAV_URL,
        calendarUrl: values.YANDEX_CALDAV_CALENDAR_URL?.trim() || undefined,
        source: p,
      }
    }
  }

  return {
    ok: false,
    diagnostic: { workspaceDir, processEnvLogin: loginState, processEnvPassword: passState, checks },
  }
}

export function formatNoCredentialsError(d: {
  workspaceDir: string
  processEnvLogin: EnvState
  processEnvPassword: EnvState
  checks: FileCheck[]
}): string {
  const lines: string[] = [
    "Учётные данные Яндекс.Календаря не найдены.",
    "Нужны переменные YANDEX_LOGIN (e.g. me@yandex.ru) и YANDEX_APP_PASSWORD (16 знаков, генерируется на id.yandex.ru → Безопасность → Пароли приложений → «Календарь и почта (CalDAV)»).",
    "",
    "Диагностика:",
    `  workspaceDir                    = ${d.workspaceDir || "(empty)"}`,
    `  process.env.YANDEX_LOGIN        = ${d.processEnvLogin}`,
    `  process.env.YANDEX_APP_PASSWORD = ${d.processEnvPassword}`,
    "  Проверены пути в порядке приоритета:",
  ]
  for (const c of d.checks) {
    lines.push(`    [${c.state.padEnd(11)}] ${c.path}`)
  }
  lines.push("")
  lines.push(
    "Рекомендация: положить YANDEX_LOGIN и YANDEX_APP_PASSWORD в mcp_servers/yandex-calendar-mcp/.env (см. .env.example) и перезапустить MCP-сервер.",
  )
  return lines.join("\n")
}
