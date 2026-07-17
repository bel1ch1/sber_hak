import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadAccessCatalog, buildAccessRequest, resetAccessCache } from "./access.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))
const CAT = path.resolve(PKG, "data/access_catalog.json")

async function cat() {
  resetAccessCache()
  return loadAccessCatalog(CAT)
}

describe("buildAccessRequest", () => {
  it("combines common + role rights without duplicates", async () => {
    const c = await cat()
    const req = buildAccessRequest(c, { newbie_id: "usr_k1m2n3", role: "IT / Разработка", manager_id: "usr_7g8h9j" })
    const codes = req.rights.map((r) => r.code)
    assert.ok(codes.includes("SSO")) // common
    assert.ok(codes.includes("GITLAB")) // role
    assert.equal(codes.length, new Set(codes).size) // no dupes
    assert.equal(req.applicant_id, "usr_k1m2n3")
    assert.equal(req.manager_id, "usr_7g8h9j")
    assert.equal(req.needs_approval, true)
  })

  it("defaults organization and points at the form", async () => {
    const c = await cat()
    const req = buildAccessRequest(c, { newbie_id: "x", role: "QA / Тестирование" })
    assert.equal(req.organization, "ТОТ")
    assert.equal(req.form, "access_request_form.html")
    assert.ok(req.rights.some((r) => r.code === "TESTRAIL"))
  })

  it("unknown role still yields common rights", async () => {
    const c = await cat()
    const req = buildAccessRequest(c, { newbie_id: "x", role: "Космонавт" })
    assert.ok(req.rights.length >= c.common.length)
  })
})
