// yandex-wiki.ts — credential resolution for Yandex Wiki API (Node.js).
import { readFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_API_BASE_URL = "https://api.wiki.yandex.net"

const PLACEHOLDERS = new Set([
  "PASTE_YOUR_OAUTH_TOKEN_HERE",
  "PASTE_YOUR_ORG_ID_HERE",
  "PASTE_YOUR_WIKI_OAUTH_TOKEN_HERE",
  "PASTE_YOUR_WIKI_ORG_ID_HERE",
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

export type WikiAuthMode = "oauth" | "iam"

export type WikiCredentials =
  | {
      ok: true
      token: string
      orgId: string
      orgHeader: "X-Org-Id" | "X-Cloud-Org-Id"
      authMode: WikiAuthMode
      apiBaseUrl: string
      readOnly: boolean
      source: string
    }
  | {
      ok: false
      diagnostic: {
        workspaceDir: string
        processEnvToken: EnvState
        processEnvOrgId: EnvState
        checks: FileCheck[]
      }
    }

function getHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || ""
}

/** `<ws>/mcp/<pkg>` or `<ws>/mcp_servers/<pkg>` → workspace root. */
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

function pickOrg(values: Record<string, string>): { orgId: string; orgHeader: "X-Org-Id" | "X-Cloud-Org-Id" } | null {
  const cloud = values.YANDEX_WIKI_CLOUD_ORG_ID?.trim()
  if (cloud && !PLACEHOLDERS.has(cloud)) {
    return { orgId: cloud, orgHeader: "X-Cloud-Org-Id" }
  }
  const org = values.YANDEX_WIKI_ORG_ID?.trim()
  if (org && !PLACEHOLDERS.has(org)) {
    return { orgId: org, orgHeader: "X-Org-Id" }
  }
  return null
}

function normalizeAuthMode(raw: string | undefined): WikiAuthMode {
  const mode = (raw ?? "oauth").trim().toLowerCase()
  return mode === "iam" ? "iam" : "oauth"
}

function normalizeReadOnly(raw: string | undefined): boolean {
  const v = (raw ?? "true").trim().toLowerCase()
  if (v === "0" || v === "false" || v === "no" || v === "off") return false
  return true
}

function credentialsFromValues(values: Record<string, string>, source: string): WikiCredentials | null {
  const token = values.YANDEX_WIKI_OAUTH_TOKEN?.trim() || values.YANDEX_WIKI_TOKEN?.trim()
  if (!token || PLACEHOLDERS.has(token)) return null
  const org = pickOrg(values)
  if (!org) return null
  return {
    ok: true,
    token,
    orgId: org.orgId,
    orgHeader: org.orgHeader,
    authMode: normalizeAuthMode(values.YANDEX_WIKI_AUTH_MODE),
    apiBaseUrl: values.YANDEX_WIKI_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
    readOnly: normalizeReadOnly(values.WIKI_READ_ONLY),
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
  const token = v.YANDEX_WIKI_OAUTH_TOKEN ?? v.YANDEX_WIKI_TOKEN
  const org = pickOrg(v)
  if (!token && !org) return { check: { path: p, state: "no-creds" } }
  if (!token || !org) return { check: { path: p, state: "no-creds" } }
  if (token.trim() === "" || org.orgId.trim() === "") return { check: { path: p, state: "empty" } }
  if (PLACEHOLDERS.has(token.trim())) return { check: { path: p, state: "placeholder" } }
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

export async function readWikiCredentials(
  workspaceDir: string,
  packageDir?: string,
): Promise<WikiCredentials> {
  const tokenState = classifyEnv(process.env.YANDEX_WIKI_OAUTH_TOKEN ?? process.env.YANDEX_WIKI_TOKEN)
  const orgState = classifyEnv(process.env.YANDEX_WIKI_ORG_ID ?? process.env.YANDEX_WIKI_CLOUD_ORG_ID)

  if (tokenState === "set" && orgState === "set") {
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
      processEnvToken: tokenState,
      processEnvOrgId: orgState,
      checks,
    },
  }
}

export function formatNoCredentialsError(d: {
  workspaceDir: string
  processEnvToken: EnvState
  processEnvOrgId: EnvState
  checks: FileCheck[]
}): string {
  const lines: string[] = [
    "Учётные данные Яндекс Вики не найдены.",
    "Нужны YANDEX_WIKI_OAUTH_TOKEN (или YANDEX_WIKI_TOKEN) и организация:",
    "  YANDEX_WIKI_ORG_ID — для Яндекс 360 для бизнеса (заголовок X-Org-Id)",
    "  или YANDEX_WIKI_CLOUD_ORG_ID — для Yandex Cloud (заголовок X-Cloud-Org-Id)",
    "",
    "Диагностика:",
    `  workspaceDir                         = ${d.workspaceDir || "(empty)"}`,
    `  process.env.YANDEX_WIKI_OAUTH_TOKEN  = ${d.processEnvToken}`,
    `  process.env.YANDEX_WIKI_ORG_ID       = ${d.processEnvOrgId}`,
    "  Проверены пути в порядке приоритета:",
  ]
  for (const c of d.checks) {
    lines.push(`    [${c.state.padEnd(11)}] ${c.path}`)
  }
  lines.push("")
  lines.push(
    "Рекомендация: положить креды в mcp/yandex-wiki-mcp/.env (см. .env.example) и перезапустить MCP-сервер.",
  )
  return lines.join("\n")
}
