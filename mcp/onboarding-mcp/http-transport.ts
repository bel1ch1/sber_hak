// http-transport.ts — Streamable HTTP слой для stepik-mcp.

import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { createHash, timingSafeEqual } from "node:crypto"

const BEARER_PATTERN = /^bearer +(.+)$/i

export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const m = BEARER_PATTERN.exec(header)
  return m ? m[1] : null
}

function digest(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest()
}

export function isAuthorized(header: string | null | undefined, expectedToken: string): boolean {
  const token = parseBearerToken(header)
  if (token === null) return false
  return timingSafeEqual(digest(token), digest(expectedToken))
}

export type ConnectableMcpServer = {
  connect(transport: unknown): Promise<void>
  close(): Promise<void> | void
}

export type HttpTransportLike = {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>
  close(): Promise<void> | void
}

export type HttpConfig =
  | { ok: true; token: string | null; port: number }
  | { ok: false; error: string }

export function resolveHttpConfig(env: Record<string, string | undefined>): HttpConfig {
  const raw = (env.MCP_AUTH_TOKEN ?? "").trim()
  const token = raw === "" ? null : raw
  const port = Number(env.MCP_HTTP_PORT ?? "3003")
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return { ok: false, error: `MCP_HTTP_PORT некорректен: "${env.MCP_HTTP_PORT}". Ожидается целое число 0-65535.` }
  }
  return { ok: true, token, port }
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  token: string | null,
  createServer: () => ConnectableMcpServer,
  createHttpTransport: () => HttpTransportLike,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost")

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end("ok")
    return
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "Not Found" }))
    return
  }

  if (token !== null && !isAuthorized(req.headers.authorization, token)) {
    res.writeHead(401, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return
  }

  const mcpServer = createServer()
  const transport = createHttpTransport()
  res.on("close", () => {
    Promise.resolve(transport.close()).catch(() => {})
    Promise.resolve(mcpServer.close()).catch(() => {})
  })
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res)
}

export function startHttpServer(
  name: string,
  cfg: { ok: true; token: string | null; port: number },
  createServer: () => ConnectableMcpServer,
  createHttpTransport: () => HttpTransportLike,
): Server {
  const httpServer = createNodeHttpServer((req, res) => {
    handleHttpRequest(req, res, cfg.token, createServer, createHttpTransport).catch((e) => {
      console.error(`${name}: unhandled HTTP error:`, e instanceof Error ? e.message : String(e))
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "Internal Server Error" }))
      }
    })
  })
  httpServer.listen(cfg.port, () => {
    const authNote = cfg.token === null
      ? "auth=OFF (MCP_AUTH_TOKEN пуст — только для внутренней сети)"
      : "auth=Bearer"
    console.error(`${name}: HTTP listening on :${cfg.port} (POST /mcp, GET /healthz, ${authNote})`)
  })
  return httpServer
}

export async function runServer(
  createServer: () => ConnectableMcpServer,
  opts: {
    name: string
    createHttpTransport: () => HttpTransportLike
    createStdioTransport: () => unknown
  },
): Promise<void> {
  const mode = (process.env.MCP_TRANSPORT ?? "stdio").trim()
  if (mode === "http") {
    const cfg = resolveHttpConfig(process.env)
    if (!cfg.ok) {
      console.error(`${opts.name}: ${cfg.error}`)
      process.exit(1)
    }
    startHttpServer(opts.name, cfg, createServer, opts.createHttpTransport)
  } else {
    await createServer().connect(opts.createStdioTransport())
  }
}
