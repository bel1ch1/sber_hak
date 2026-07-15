import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { WikiApiError, assertWritable } from "./yandex-wiki-client.ts"
import type { WikiClientContext } from "./yandex-wiki-client.ts"

const baseCtx: WikiClientContext = {
  ok: true,
  token: "token",
  orgId: "org",
  orgHeader: "X-Org-Id",
  authMode: "oauth",
  apiBaseUrl: "https://api.wiki.yandex.net",
  readOnly: false,
  source: "test",
}

describe("assertWritable", () => {
  it("allows writes when readOnly=false", () => {
    assert.doesNotThrow(() => assertWritable(baseCtx))
  })

  it("blocks writes when readOnly=true", () => {
    assert.throws(
      () => assertWritable({ ...baseCtx, readOnly: true }),
      (e: unknown) => e instanceof WikiApiError && e.status === 403,
    )
  })
})

describe("WikiApiError", () => {
  it("carries status and code", () => {
    const err = new WikiApiError("fail", 404, "NOT_FOUND")
    assert.equal(err.status, 404)
    assert.equal(err.errorCode, "NOT_FOUND")
    assert.match(err.message, /fail/)
  })
})
