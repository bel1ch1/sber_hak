import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  readWikiCredentials,
  resolveWorkspaceRoot,
  buildCandidatePaths,
} from "./yandex-wiki.ts"

describe("resolveWorkspaceRoot", () => {
  it("mcp/<pkg> → workspace root above mcp/", () => {
    const root = resolveWorkspaceRoot("C:/work/sber_hak/mcp/yandex-wiki-mcp")
    assert.equal(root.replace(/\\/g, "/"), "C:/work/sber_hak")
  })
})

describe("readWikiCredentials", () => {
  it("defaults readOnly to true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wiki-mcp-ro-"))
    const pkg = path.join(dir, "mcp", "yandex-wiki-mcp")
    await mkdir(pkg, { recursive: true })
    await writeFile(
      path.join(pkg, ".env"),
      "YANDEX_WIKI_OAUTH_TOKEN=test-token-123\nYANDEX_WIKI_ORG_ID=org-456\n",
      "utf8",
    )
    const creds = await readWikiCredentials(dir, pkg)
    assert.equal(creds.ok, true)
    if (creds.ok) assert.equal(creds.readOnly, true)
    await rm(dir, { recursive: true, force: true })
  })

  it("reads token and org from package .env", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wiki-mcp-"))
    const pkg = path.join(dir, "mcp", "yandex-wiki-mcp")
    await mkdir(pkg, { recursive: true })
    await writeFile(
      path.join(pkg, ".env"),
      "YANDEX_WIKI_OAUTH_TOKEN=test-token-123\nYANDEX_WIKI_ORG_ID=org-456\n",
      "utf8",
    )
    const creds = await readWikiCredentials(dir, pkg)
    assert.equal(creds.ok, true)
    if (creds.ok) {
      assert.equal(creds.token, "test-token-123")
      assert.equal(creds.orgId, "org-456")
      assert.equal(creds.orgHeader, "X-Org-Id")
      assert.equal(creds.authMode, "oauth")
    }
    await rm(dir, { recursive: true, force: true })
  })

  it("returns diagnostic when creds missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wiki-mcp-empty-"))
    const pkg = path.join(dir, "mcp", "yandex-wiki-mcp")
    const creds = await readWikiCredentials(dir, pkg)
    assert.equal(creds.ok, false)
    await rm(dir, { recursive: true, force: true })
  })
})

describe("buildCandidatePaths", () => {
  it("includes package .env first", () => {
    const paths = buildCandidatePaths("/ws", "/ws/mcp/yandex-wiki-mcp")
    assert.match(paths[0], /yandex-wiki-mcp[/\\]\.env$/)
  })
})
