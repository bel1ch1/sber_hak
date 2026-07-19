// get-refresh-token.ts — one-shot OAuth Desktop flow → prints GMAIL_REFRESH_TOKEN
// Usage: npm run auth  (requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in .env)

import http from "node:http"
import { URL } from "node:url"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { google } from "googleapis"
import { loadPackageEnv } from "./gmail-config.ts"
import { SCOPES } from "./gmail-client.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
await loadPackageEnv(HERE)

const clientId = (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim()
const clientSecret = (process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim()

if (!clientId || !clientSecret) {
  console.error(
    "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in mcp/gmail-mcp/.env first.\n" +
      "See SETUP_GMAIL.md for Google Cloud Console clicks.",
  )
  process.exit(1)
}

const REDIRECT = "http://127.0.0.1:53682/oauth2callback"
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT)

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
})

console.log("\n1) Open this URL in a browser (same Google account as Gmail):\n")
console.log(authUrl)
console.log("\n2) Sign in and allow Gmail access.")
console.log("3) Browser will redirect to localhost — this script captures the code.\n")

const code = await new Promise<string>((resolve, reject) => {
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", REDIRECT)
      if (u.pathname !== "/oauth2callback") {
        res.writeHead(404)
        res.end("Not found")
        return
      }
      const err = u.searchParams.get("error")
      if (err) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" })
        res.end(`<h1>OAuth error</h1><pre>${err}</pre>`)
        server.close()
        reject(new Error(err))
        return
      }
      const c = u.searchParams.get("code")
      if (!c) {
        res.writeHead(400)
        res.end("Missing code")
        return
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end("<h1>OK</h1><p>You can close this tab and return to the terminal.</p>")
      server.close()
      resolve(c)
    } catch (e) {
      reject(e)
    }
  })
  server.listen(53682, "127.0.0.1", () => {
    console.log("Listening on http://127.0.0.1:53682/oauth2callback …")
  })
  server.on("error", reject)
})

const { tokens } = await oauth2.getToken(code)
if (!tokens.refresh_token) {
  console.error(
    "No refresh_token in response. Revoke app access at https://myaccount.google.com/permissions and re-run with prompt=consent.",
  )
  console.error(JSON.stringify(tokens, null, 2))
  process.exit(1)
}

console.log("\nAdd these lines to mcp/gmail-mcp/.env:\n")
console.log(`GMAIL_CLIENT_ID=${clientId}`)
console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`)
console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
if (tokens.expiry_date) {
  console.log(`# access token expires at ${new Date(tokens.expiry_date).toISOString()} (auto-refreshed)`)
}
console.log("\nThen: docker compose -f docker-compose.mcp.yml up -d --build gmail-mcp\n")
