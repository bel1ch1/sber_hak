// smoke-discovery-only.ts — read-only credential check for Yandex Wiki API.
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  readWikiCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-wiki.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)

async function main() {
  await loadPackageEnv(PACKAGE_DIR)
  const creds = await readWikiCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    console.error(formatNoCredentialsError(creds.diagnostic))
    process.exit(1)
  }
  console.log("Credentials OK")
  console.log("  source:    ", creds.source)
  console.log("  apiBaseUrl:", creds.apiBaseUrl)
  console.log("  authMode:  ", creds.authMode)
  console.log("  orgHeader: ", creds.orgHeader)
  console.log("  orgId:     ", creds.orgId.slice(0, 4) + "…")
  console.log("  readOnly:  ", creds.readOnly)
  console.log("\nSmoke discovery OK (no API calls made). Fill WIKI_TEST_SLUG to probe a page.")
}

main().catch((e) => {
  console.error("\nDISCOVERY ERROR:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
