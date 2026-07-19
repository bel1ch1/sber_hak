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

describe("expandIdsInText", () => {
  it("replaces known ids in body with emails (logins)", () => {
    const obf = createObfuscator(fixtureDir())
    const out = obf.expandIdsInText(
      "Прошу согласовать (кому): usr_1\nСотрудник (id): usr_2\n[onboarding:usr_1]",
    )
    assert.equal(
      out,
      "Прошу согласовать (кому): ivan@yandex.ru\nСотрудник (id): maria@yandex.ru\n[onboarding:ivan@yandex.ru]",
    )
  })

  it("leaves unknown tokens unchanged", () => {
    const obf = createObfuscator(fixtureDir())
    assert.equal(obf.expandIdsInText("user usr_999 ok"), "user usr_999 ok")
  })

  it("expands self after registerSelf", () => {
    const obf = createObfuscator(fixtureDir())
    obf.registerSelf("me@yandex.ru")
    assert.equal(obf.expandIdsInText("from self mailbox"), "from me@yandex.ru mailbox")
  })
})

describe("maskIdsInText", () => {
  it("reverse-masks known emails in subject/body back to ids", () => {
    const obf = createObfuscator(fixtureDir())
    const expanded = obf.expandIdsInText(
      "Прошу согласовать (кому): usr_1\nСотрудник (id): usr_2\n[onboarding:usr_1]",
    )
    assert.equal(
      obf.maskIdsInText(expanded),
      "Прошу согласовать (кому): usr_1\nСотрудник (id): usr_2\n[onboarding:usr_1]",
    )
  })

  it("is case-insensitive for emails", () => {
    const obf = createObfuscator(fixtureDir())
    assert.equal(obf.maskIdsInText("To: Ivan@Yandex.RU please"), "To: usr_1 please")
  })

  it("maps self mailbox to self after registerSelf", () => {
    const obf = createObfuscator(fixtureDir())
    obf.registerSelf("me@yandex.ru")
    assert.equal(obf.maskIdsInText("from me@yandex.ru mailbox"), "from self mailbox")
  })

  it("masks observed ext_ emails in body", () => {
    const obf = createObfuscator(fixtureDir())
    const token = obf.maskAddress("stranger@example.com")
    assert.equal(obf.maskIdsInText("ping stranger@example.com now"), `ping ${token} now`)
  })

  it("leaves unknown emails unchanged", () => {
    const obf = createObfuscator(fixtureDir())
    assert.equal(obf.maskIdsInText("mail other@corp.test"), "mail other@corp.test")
  })
})

describe("round-trip through send", () => {
  it("returns accepted as the opaque ids the agent requested", () => {
    const obf = createObfuscator(fixtureDir())
    const { emails } = obf.resolveRecipients(["usr_1", "usr_2"])
    const masked = obf.maskSendResult(
      { messageId: "x", accepted: emails, rejected: [] },
      { to: ["usr_1", "usr_2"] },
    )
    assert.deepEqual(masked.accepted, ["usr_1", "usr_2"])
  })

  it("keeps role id when demo roles share the self mailbox", () => {
    const dir = parseRecipientsCsv(
      ["usr_hr,me@demo.test,HR", "usr_manager,me@demo.test,Manager"].join("\n"),
    )
    const obf = createObfuscator(dir)
    obf.registerSelf("me@demo.test")
    const { emails } = obf.resolveRecipients(["usr_hr"])
    assert.deepEqual(emails, ["me@demo.test"])
    const masked = obf.maskSendResult(
      { messageId: "msg1", accepted: emails, rejected: [] },
      { to: ["usr_hr"] },
    )
    assert.deepEqual(masked.accepted, ["usr_hr"])
    const listed = obf.maskListItems([
      {
        uid: "msg1",
        subject: "access",
        from: ["me@demo.test"],
        to: ["me@demo.test"],
        date: "",
        seen: true,
      },
    ])
    assert.deepEqual(listed[0].to, ["usr_hr"])
    assert.deepEqual(listed[0].from, ["self"])
  })
})

describe("maskListItems / maskMessage", () => {
  it("masks from/to and subject on list items", () => {
    const obf = createObfuscator(fixtureDir())
    const [item] = obf.maskListItems([
      {
        uid: 1,
        subject: "hi ivan@yandex.ru",
        from: ["ivan@yandex.ru"],
        to: ["maria@yandex.ru"],
        date: "",
        seen: false,
      },
    ])
    assert.deepEqual(item.from, ["usr_1"])
    assert.deepEqual(item.to, ["usr_2"])
    assert.equal(item.subject, "hi usr_1")
  })

  it("masks from/to/cc and subject/text/html on a full message", () => {
    const obf = createObfuscator(fixtureDir())
    const m = obf.maskMessage({
      uid: 1,
      subject: "hi ivan@yandex.ru",
      from: ["ivan@yandex.ru"],
      to: ["maria@yandex.ru"],
      cc: ["stranger@example.com"],
      date: "",
      text: "body for maria@yandex.ru",
      html: "<p>maria@yandex.ru</p>",
    })
    assert.deepEqual(m.from, ["usr_1"])
    assert.deepEqual(m.to, ["usr_2"])
    assert.match(m.cc[0], /^ext_[0-9a-f]{8}$/)
    assert.equal(m.subject, "hi usr_1")
    assert.equal(m.text, "body for usr_2")
    assert.equal(m.html, "<p>usr_2</p>")
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
