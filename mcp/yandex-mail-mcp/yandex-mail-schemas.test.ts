import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ListMessagesInput,
  GetMessageInput,
  SendMailInput,
  SendMailByIdInput,
  RecipientId,
} from "./yandex-mail-schemas.ts"

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

describe("SendMailByIdInput / RecipientId", () => {
  it("accepts opaque recipient ids", () => {
    const r = SendMailByIdInput.parse({ to: ["usr_a1b2c3", "self"], subject: "Hi", text: "Body" })
    assert.deepEqual(r.to, ["usr_a1b2c3", "self"])
  })

  it("rejects an email address in place of an id", () => {
    assert.throws(() => RecipientId.parse("someone@yandex.ru"))
    assert.throws(() => SendMailByIdInput.parse({ to: ["a@yandex.ru"], subject: "x", text: "y" }))
  })

  it("rejects empty to", () => {
    assert.throws(() => SendMailByIdInput.parse({ to: [], subject: "x", text: "y" }))
  })
})
