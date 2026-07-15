import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  PageIdentityInput,
  CreatePageInput,
  UpdatePagePatchInput,
  AppendContentInput,
  ListDescendantsInput,
} from "./yandex-wiki-schemas.ts"

describe("PageIdentityInput", () => {
  it("accepts slug", () => {
    const r = PageIdentityInput.safeParse({ slug: "team/docs" })
    assert.equal(r.success, true)
  })

  it("rejects empty identity", () => {
    const r = PageIdentityInput.safeParse({})
    assert.equal(r.success, false)
  })
})

describe("CreatePageInput", () => {
  it("requires title and slug", () => {
    const r = CreatePageInput.safeParse({ title: "Hello", slug: "a/b" })
    assert.equal(r.success, true)
    if (r.success) assert.equal(r.data.content, "")
  })
})

describe("UpdatePagePatchInput", () => {
  it("requires at least one field", () => {
    assert.equal(UpdatePagePatchInput.safeParse({}).success, false)
    assert.equal(UpdatePagePatchInput.safeParse({ content: "x" }).success, true)
  })
})

describe("AppendContentInput", () => {
  it("defaults location to bottom", () => {
    const r = AppendContentInput.safeParse({ page_id: 1, content: "hi" })
    assert.equal(r.success, true)
    if (r.success) assert.equal(r.data.location, "bottom")
  })
})

describe("ListDescendantsInput", () => {
  it("defaults page_size", () => {
    const r = ListDescendantsInput.safeParse({ slug: "home" })
    assert.equal(r.success, true)
    if (r.success) assert.equal(r.data.page_size, 50)
  })
})
