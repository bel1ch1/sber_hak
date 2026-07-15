// smoke-discovery-only.ts — READ-ONLY IMAP connection check (LIST folders, no send).
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyMailConnection } from "./yandex-mail-client.ts"
import {
  readMailCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-mail.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)

async function main() {
  await loadPackageEnv(PACKAGE_DIR)
  const creds = await readMailCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    console.error(formatNoCredentialsError(creds.diagnostic))
    process.exit(1)
  }
  console.log("Credentials OK")
  console.log("  login:    ", creds.login)
  console.log("  auth:     ", creds.authMode)
  console.log("  imap:     ", `${creds.imapHost}:${creds.imapPort}`)
  console.log("  send:     ", creds.sendEnabled ? "enabled" : "disabled")

  console.log("\nConnecting to IMAP (LIST mailboxes)...")
  const result = await verifyMailConnection(creds)
  console.log("\nDISCOVERY OK")
  console.log("  folder_count:", result.folder_count)
  console.log("\nIMAP auth works. No messages read, no emails sent.")
}

main().catch((e) => {
  console.error("\nDISCOVERY ERROR:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
