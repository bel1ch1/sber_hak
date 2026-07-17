import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseRecipientsCsv } from "./recipient-directory.ts"
import {
  createObfuscator,
  createPassthroughObfuscator,
  isObfuscationEnabled,
  extractEmail,
  SELF_ID,
} from "./obfuscation.ts"

function fixtureDir() {
  return parseRecipientsCsv(["usr_1,ivan@yandex.ru,Ivan", "usr_2,maria@yandex.ru,Maria"].join("\n"))
}

describe("extractEmail", () => {
  it('pulls the address out of "Name <email>"', () => {
    assert.equal(extractEmail("Ivan Petrov <ivan@yandex.ru>"), "ivan@yandex.ru")
  })
  it("returns a bare email as-is", () => {
    assert.equal(extractEmail("ivan@yandex.ru"), "ivan@yandex.ru")
  })
  it("returns null when there is no email", () => {
    assert.equal(extractEmail("Ivan Petrov"), null)
  })
})

describe("maskAddress (directory)", () => {
  it("maps a known address to its id and drops the display name", () => {
    const obf = createObfuscator(fixtureDir())
    assert.equal(obf.maskAddress("Ivan Petrov <ivan@yandex.ru>"), "usr_1")
    assert.equal(obf.maskAddress("maria@yandex.ru"), "usr_2")
  })

  it("maps the authenticated login to self", () => {
    const obf = createObfuscator(fixtureDir())
    obf.registerSelf("me@yandex.ru")
    assert.equal(obf.maskAddress("Me <me@yandex.ru>"), SELF_ID)
  })

  it("mints a stable ext_ token for unknown addresses", () => {
    const obf = createObfuscator(fixtureDir())
    const a = obf.maskAddress("stranger@example.com")
    const b = obf.maskAddress("Stranger <stranger@example.com>")
    assert.match(a, /^ext_[0-9a-f]{8}$/)
    assert.equal(a, b) // deterministic + case-insensitive
  })

  it("never leaks a bare name as an address", () => {
    const obf = createObfuscator(fixtureDir())
    assert.equal(obf.maskAddress("Just A Name"), "(hidden)")
  })
})

describe("resolveRecipients (directory)", () => {
  it("resolves known ids to real emails", () => {
    const obf = createObfuscator(fixtureDir())
    const r = obf.resolveRecipients(["usr_1", "usr_2"])
    assert.deepEqual(r.emails, ["ivan@yandex.ru", "maria@yandex.ru"])
    assert.deepEqual(r.unknown, [])
  })

  it("resolves self", () => {
    const obf = createObfuscator(fixtureDir())
    obf.registerSelf("me@yandex.ru")
    assert.deepEqual(obf.resolveRecipients([SELF_ID]).emails, ["me@yandex.ru"])
  })

  it("flags unknown ids", () => {
    const obf = createObfuscator(fixtureDir())
    const r = obf.resolveRecipients(["usr_1", "usr_999"])
    assert.deepEqual(r.emails, ["ivan@yandex.ru"])
    assert.deepEqual(r.unknown, ["usr_999"])
  })

  it("can reply to an ext_ token observed while reading", () => {
    const obf = createObfuscator(fixtureDir())
    const token = obf.maskAddress("stranger@example.com") // observe it first
    const r = obf.resolveRecipients([token])
    assert.deepEqual(r.emails, ["stranger@example.com"])
    assert.deepEqual(r.unknown, [])
  })

  it("cannot resolve an ext_ token that was never observed", () => {
    const obf = createObfuscator(fixtureDir())
    const r = obf.resolveRecipients(["ext_deadbeef"])
    assert.deepEqual(r.unknown, ["ext_deadbeef"])
  })
})

describe("round-trip through send", () => {
  it("masks accepted addresses back to the ids the agent used", () => {
    const obf = createObfuscator(fixtureDir())
    const { emails } = obf.resolveRecipients(["usr_1", "usr_2"])
    const masked = obf.maskSendResult({ message_id: "x", accepted: emails, rejected: [] })
    assert.deepEqual(masked.accepted, ["usr_1", "usr_2"])
  })
})

describe("maskListItems / maskMessage", () => {
  it("masks from/to on list items", () => {
    const obf = createObfuscator(fixtureDir())
    const [item] = obf.maskListItems([
      { uid: 1, subject: "hi", from: ["ivan@yandex.ru"], to: ["maria@yandex.ru"], date: "", seen: false },
    ])
    assert.deepEqual(item.from, ["usr_1"])
    assert.deepEqual(item.to, ["usr_2"])
  })

  it("masks from/to/cc on a full message", () => {
    const obf = createObfuscator(fixtureDir())
    const m = obf.maskMessage({
      uid: 1,
      subject: "hi",
      from: ["ivan@yandex.ru"],
      to: ["maria@yandex.ru"],
      cc: ["stranger@example.com"],
      date: "",
      text: "body",
    })
    assert.deepEqual(m.from, ["usr_1"])
    assert.deepEqual(m.to, ["usr_2"])
    assert.match(m.cc[0], /^ext_[0-9a-f]{8}$/)
    assert.equal(m.text, "body") // body untouched
  })
})

describe("passthrough (obfuscation disabled)", () => {
  it("leaves addresses and recipients unchanged", () => {
    const obf = createPassthroughObfuscator()
    assert.equal(obf.enabled, false)
    assert.equal(obf.maskAddress("ivan@yandex.ru"), "ivan@yandex.ru")
    const r = obf.resolveRecipients(["a@yandex.ru", "b@yandex.ru"])
    assert.deepEqual(r.emails, ["a@yandex.ru", "b@yandex.ru"])
    assert.deepEqual(r.unknown, [])
  })
})

describe("isObfuscationEnabled", () => {
  it("defaults to on", () => {
    assert.equal(isObfuscationEnabled({}), true)
  })
  it("honors falsey values", () => {
    for (const v of ["false", "0", "no", "off", "FALSE"]) {
      assert.equal(isObfuscationEnabled({ MAIL_OBFUSCATION: v }), false)
    }
  })
  it("stays on for truthy values", () => {
    assert.equal(isObfuscationEnabled({ MAIL_OBFUSCATION: "true" }), true)
  })
})
