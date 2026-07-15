// yandex-calendar.test.ts
import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { readYandexCredentials, formatNoCredentialsError } from "./yandex-calendar.ts"
import { writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TMP = join(tmpdir(), "yandex-calendar-test-" + Date.now())
const TEST_APP_PASSWORD = "test-app-password"

beforeEach(() => {
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {}
  mkdirSync(join(TMP, ".opencode"), { recursive: true })
  delete process.env.YANDEX_LOGIN
  delete process.env.YANDEX_APP_PASSWORD
})

describe("readYandexCredentials", () => {
  it("reads from process.env when both set", async () => {
    process.env.YANDEX_LOGIN = "me@yandex.ru"
    process.env.YANDEX_APP_PASSWORD = TEST_APP_PASSWORD
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.login, "me@yandex.ru")
      assert.equal(result.password, TEST_APP_PASSWORD)
      assert.equal(result.caldavUrl, "https://caldav.yandex.ru/")
    }
  })

  it("reads from <workspace>/.opencode/.env if process.env absent", async () => {
    writeFileSync(
      join(TMP, ".opencode", ".env"),
      `YANDEX_LOGIN=me@yandex.ru\nYANDEX_APP_PASSWORD=${TEST_APP_PASSWORD}\n`,
    )
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok, true)
  })

  it("reads from package-local .env", async () => {
    const pkg = join(TMP, "pkg")
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, ".env"), `YANDEX_LOGIN=pkg@yandex.ru\nYANDEX_APP_PASSWORD=${TEST_APP_PASSWORD}\n`)
    const result = await readYandexCredentials(TMP, pkg)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.login, "pkg@yandex.ru")
  })

  it("respects YANDEX_CALDAV_URL override", async () => {
    process.env.YANDEX_LOGIN = "me@yandex.ru"
    process.env.YANDEX_APP_PASSWORD = TEST_APP_PASSWORD
    process.env.YANDEX_CALDAV_URL = "https://caldav.example.com/"
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok && result.caldavUrl, "https://caldav.example.com/")
    delete process.env.YANDEX_CALDAV_URL
  })

  it("returns diagnostic with all paths checked on miss", async () => {
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.diagnostic.checks.length >= 3)
      assert.equal(result.diagnostic.processEnvLogin, "absent")
    }
  })

  it("rejects placeholder values", async () => {
    process.env.YANDEX_LOGIN = "PASTE_YOUR_YANDEX_LOGIN_HERE"
    process.env.YANDEX_APP_PASSWORD = "abcd"
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok, false)
  })

  it("treats partial credentials (login only) in env file as missing, not crash", async () => {
    writeFileSync(join(TMP, ".opencode", ".env"), "YANDEX_LOGIN=me@yandex.ru\n")
    const result = await readYandexCredentials(TMP)
    assert.equal(result.ok, false)
    if (!result.ok) {
      const fileCheck = result.diagnostic.checks.find((c) => c.path.includes(".opencode"))
      assert.equal(fileCheck?.state, "no-creds")
    }
  })
})

describe("formatNoCredentialsError", () => {
  it("produces a Russian diagnostic mentioning id.yandex.ru", async () => {
    const result = await readYandexCredentials(TMP)
    if (!result.ok) {
      const msg = formatNoCredentialsError(result.diagnostic)
      assert.match(msg, /id\.yandex\.ru/)
      assert.match(msg, /YANDEX_LOGIN/)
      assert.match(msg, /YANDEX_APP_PASSWORD/)
    }
  })
})
