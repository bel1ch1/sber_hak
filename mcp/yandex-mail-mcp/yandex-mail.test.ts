import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  readMailCredentials,
  formatNoCredentialsError,
  resolveWorkspaceRoot,
} from "./yandex-mail.ts"

describe("resolveWorkspaceRoot", () => {
  it("mcp/<pkg> → workspace root", () => {
    const root = resolveWorkspaceRoot("C:/proj/mcp/yandex-mail-mcp")
    assert.equal(root.replace(/\\/g, "/"), "C:/proj")
  })
})

describe("readMailCredentials", () => {
  it("reads oauth creds from process.env", async () => {
    const keys = ["YANDEX_MAIL_LOGIN", "YANDEX_MAIL_OAUTH_TOKEN", "YANDEX_MAIL_APP_PASSWORD"] as const
    const prev: Record<string, string | undefined> = {}
    for (const k of keys) prev[k] = process.env[k]
    process.env.YANDEX_MAIL_LOGIN = "me@yandex.ru"
    process.env.YANDEX_MAIL_OAUTH_TOKEN = "oauth-token-123"
    delete process.env.YANDEX_MAIL_APP_PASSWORD
    try {
      const r = await readMailCredentials("/tmp", undefined)
      assert.equal(r.ok, true)
      if (r.ok) {
        assert.equal(r.login, "me@yandex.ru")
        assert.equal(r.authMode, "oauth")
        assert.equal(r.oauthToken, "oauth-token-123")
      }
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k]
        else process.env[k] = prev[k]
      }
    }
  })

  it("reads app password from package .env", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mail-mcp-"))
    const pkg = path.join(dir, "mcp", "yandex-mail-mcp")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(pkg, { recursive: true })
    await writeFile(
      path.join(pkg, ".env"),
      "YANDEX_MAIL_LOGIN=me@yandex.ru\nYANDEX_MAIL_APP_PASSWORD=secret-app-pass\n",
      "utf8",
    )
    const prev: Record<string, string | undefined> = {}
    for (const k of ["YANDEX_MAIL_LOGIN", "YANDEX_MAIL_OAUTH_TOKEN", "YANDEX_MAIL_APP_PASSWORD"] as const) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
    try {
      const r = await readMailCredentials(dir, pkg)
      assert.equal(r.ok, true)
      if (r.ok) {
        assert.equal(r.authMode, "password")
        assert.equal(r.appPassword, "secret-app-pass")
      }
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns diagnostic on miss", async () => {
    const keys = ["YANDEX_MAIL_LOGIN", "YANDEX_MAIL_OAUTH_TOKEN", "YANDEX_MAIL_APP_PASSWORD"] as const
    const prev: Record<string, string | undefined> = {}
    for (const k of keys) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
    try {
      const r = await readMailCredentials("/nonexistent-ws", "/nonexistent/pkg")
      assert.equal(r.ok, false)
      if (!r.ok) {
        const msg = formatNoCredentialsError(r.diagnostic)
        assert.match(msg, /YANDEX_MAIL_LOGIN/)
        assert.match(msg, /YANDEX_MAIL_OAUTH_TOKEN/)
      }
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k]
        else process.env[k] = prev[k]
      }
    }
  })
})
