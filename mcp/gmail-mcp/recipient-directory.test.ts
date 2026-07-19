import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { parseRecipientsCsv, loadRecipientDirectory } from "./recipient-directory.ts"

describe("parseRecipientsCsv", () => {
  it("parses rows and builds both maps", () => {
    const dir = parseRecipientsCsv(
      ["id,email,label", "usr_1,ivan@yandex.ru,Ivan", "usr_2,maria@yandex.ru,Maria (HR)"].join("\n"),
    )
    assert.equal(dir.entries.length, 2)
    assert.equal(dir.byId.get("usr_1")?.email, "ivan@yandex.ru")
    assert.equal(dir.byEmail.get("ivan@yandex.ru"), "usr_1")
    // email lookup is case-insensitive
    assert.equal(dir.byEmail.get("maria@yandex.ru"), "usr_2")
    assert.equal(dir.byId.get("usr_2")?.label, "Maria (HR)")
  })

  it("skips comments, blank lines and the header", () => {
    const dir = parseRecipientsCsv(
      ["# a comment", "", "id,email,label", "usr_1,ivan@yandex.ru,Ivan", "", "# trailing"].join("\n"),
    )
    assert.equal(dir.entries.length, 1)
  })

  it("works without a header row", () => {
    const dir = parseRecipientsCsv("usr_1,ivan@yandex.ru\nusr_2,maria@yandex.ru")
    assert.equal(dir.entries.length, 2)
    assert.equal(dir.byId.get("usr_1")?.email, "ivan@yandex.ru")
  })

  it("honors quoted fields with commas", () => {
    const dir = parseRecipientsCsv('usr_1,ivan@yandex.ru,"Petrov, Ivan"')
    assert.equal(dir.byId.get("usr_1")?.label, "Petrov, Ivan")
  })

  it("warns on rows without id/email and on non-emails", () => {
    const dir = parseRecipientsCsv(["usr_1,", ",maria@yandex.ru", "usr_3,notanemail"].join("\n"))
    assert.equal(dir.entries.length, 0)
    assert.equal(dir.warnings.length, 3)
  })

  it("warns on duplicate id (later wins)", () => {
    const dir = parseRecipientsCsv(["usr_1,a@yandex.ru", "usr_1,b@yandex.ru"].join("\n"))
    assert.equal(dir.byId.get("usr_1")?.email, "b@yandex.ru")
    assert.ok(dir.warnings.some((w) => /duplicate id/.test(w)))
  })
})

describe("loadRecipientDirectory", () => {
  it("reads a CSV file from disk", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "recip-"))
    const csv = path.join(tmp, "recipients.csv")
    await writeFile(csv, "id,email\nusr_1,ivan@yandex.ru\n", "utf8")
    try {
      const dir = await loadRecipientDirectory(csv)
      assert.equal(dir.byId.get("usr_1")?.email, "ivan@yandex.ru")
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it("returns an empty directory (with a warning) when the file is missing", async () => {
    const dir = await loadRecipientDirectory("/nonexistent/recipients.csv")
    assert.equal(dir.entries.length, 0)
    assert.ok(dir.warnings.length > 0)
  })
})
