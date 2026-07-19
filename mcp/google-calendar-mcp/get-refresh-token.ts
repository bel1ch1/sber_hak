// get-refresh-token.ts — OAuth with Gmail + Calendar scopes (shared token)

import http from "node:http"
import { URL } from "node:url"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { google } from "googleapis"
import { loadPackageEnv, GOOGLE_SCOPES } from "./google-config.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
await loadPackageEnv(HERE)

const clientId = (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim()
const clientSecret = (process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim()

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (same as gmail-mcp).")
  process.exit(1)
}

const REDIRECT = "http://127.0.0.1:53682/oauth2callback"
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT)

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: GOOGLE_SCOPES,
})

console.log("\n1) Open this URL (allow Gmail + Google Calendar):\n")
console.log(authUrl)
console.log("\n2) Sign in → Allow.")
console.log("3) Browser shows OK — token is captured here.\n")

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
      res.end("<h1>OK</h1><p>Close this tab.</p>")
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
  console.error("No refresh_token. Revoke app at https://myaccount.google.com/permissions and retry.")
  process.exit(1)
}

console.log("\nWrite GMAIL_REFRESH_TOKEN into BOTH mcp/gmail-mcp/.env and mcp/google-calendar-mcp/.env:\n")
console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
console.log("\nAlso enable Google Calendar API in Cloud Console if not yet enabled.\n")
