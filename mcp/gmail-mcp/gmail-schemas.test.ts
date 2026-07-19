import { test } from "node:test"
import assert from "node:assert/strict"
import { GetMessageInput, ListMessagesInput, SendMailByIdInput } from "./gmail-schemas.ts"

test("ListMessagesInput defaults", () => {
  const p = ListMessagesInput.parse({})
  assert.equal(p.folder, "INBOX")
  assert.equal(p.limit, 20)
})

test("GetMessageInput accepts string uid (Gmail id)", () => {
  const p = GetMessageInput.parse({ uid: "18f0abc" })
  assert.equal(p.uid, "18f0abc")
})

test("SendMailByIdInput requires opaque ids", () => {
  const p = SendMailByIdInput.parse({
    to: ["usr_employee"],
    subject: "Hi",
    text: "Body",
  })
  assert.deepEqual(p.to, ["usr_employee"])
})
