import { test } from "node:test"
import assert from "node:assert/strict"
import { buildServer } from "./server.ts"

test("buildServer: каждый вызов — свежий инстанс (stateless http)", () => {
  assert.notEqual(buildServer(), buildServer())
})
