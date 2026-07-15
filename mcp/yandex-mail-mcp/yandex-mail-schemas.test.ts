import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ListMessagesInput, GetMessageInput, SendMailInput } from "./yandex-mail-schemas.ts"

describe("ListMessagesInput", () => {
  it("defaults folder to INBOX", () => {
    const r = ListMessagesInput.parse({})
    assert.equal(r.folder, "INBOX")
    assert.equal(r.limit, undefined)
  })

  it("rejects limit > 100", () => {
    assert.throws(() => ListMessagesInput.parse({ limit: 101 }))
  })
})

describe("GetMessageInput", () => {
  it("requires uid", () => {
    assert.throws(() => GetMessageInput.parse({}))
    const r = GetMessageInput.parse({ uid: 42 })
    assert.equal(r.folder, "INBOX")
    assert.equal(r.uid, 42)
  })
})

describe("SendMailInput", () => {
  it("accepts minimal send payload", () => {
    const r = SendMailInput.parse({
      to: ["a@yandex.ru"],
      subject: "Hi",
      text: "Body",
    })
    assert.deepEqual(r.to, ["a@yandex.ru"])
  })

  it("rejects empty to", () => {
    assert.throws(() => SendMailInput.parse({ to: [], subject: "x", text: "y" }))
  })
})
