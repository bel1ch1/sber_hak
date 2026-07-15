import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseBearerToken, isAuthorized, resolveHttpConfig } from "./http-transport.ts"

describe("http-transport auth", () => {
  it("parseBearerToken: extracts token after Bearer", () => {
    assert.equal(parseBearerToken("Bearer abc"), "abc")
  })

  it("parseBearerToken: scheme is case-insensitive", () => {
    assert.equal(parseBearerToken("bearer abc"), "abc")
    assert.equal(parseBearerToken("BEARER AbC"), "AbC")
  })

  it("isAuthorized: correct token → true", () => {
    assert.equal(isAuthorized("Bearer secret-123", "secret-123"), true)
  })

  it("isAuthorized: wrong token → false", () => {
    assert.equal(isAuthorized("Bearer wrong", "secret-123"), false)
  })

  it("resolveHttpConfig: empty MCP_AUTH_TOKEN → auth off (token null)", () => {
    const cfg = resolveHttpConfig({ MCP_AUTH_TOKEN: "", MCP_HTTP_PORT: "3000" })
    assert.equal(cfg.ok, true)
    if (cfg.ok) assert.equal(cfg.token, null)
  })

  it("resolveHttpConfig: set MCP_AUTH_TOKEN → bearer required", () => {
    const cfg = resolveHttpConfig({ MCP_AUTH_TOKEN: "secret", MCP_HTTP_PORT: "3004" })
    assert.equal(cfg.ok, true)
    if (cfg.ok) {
      assert.equal(cfg.token, "secret")
      assert.equal(cfg.port, 3004)
    }
  })
})
