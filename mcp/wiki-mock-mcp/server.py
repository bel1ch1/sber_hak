"""Mock company Wiki MCP connector for the Ouroboros onboarding agent.

Serves company knowledge (team pages, access policy, onboarding checklist,
training catalogue, dev standards) from local markdown — no external Wiki or
OAuth needed. A drop-in stand-in for a real corporate wiki in the demo.

Runs as a streamable-HTTP MCP server. Register in Ouroboros
Settings -> Advanced -> MCP as:

    {"id": "wiki", "name": "wiki", "url": "http://localhost:9102/mcp",
     "transport": "streamable_http", "enabled": true}

Config: MCP_PORT (default 9102).
"""
from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from wiki_store import WikiStore

PORT = int(os.environ.get("MCP_PORT", "9102"))
store = WikiStore()
mcp = FastMCP("wiki", host="127.0.0.1", port=PORT)


@mcp.tool()
def wiki_search(query: str, limit: int = 5) -> dict:
    """Full-text search across the company wiki; returns best-matching pages
    (slug, title, snippet). Read-only. Unlike Yandex Wiki, search IS supported.

    Example: wiki_search("доступы backend Платёжные сервисы")."""
    return {"ok": True, "results": store.search(query, limit)}


@mcp.tool()
def wiki_get_page(slug: str) -> dict:
    """Return a wiki page by slug: title and full markdown content. Read-only."""
    page = store.get(slug)
    if not page:
        return {"ok": False, "error": f"page not found: {slug}",
                "available": [p["slug"] for p in store.list()]}
    return {"ok": True, "page": page}


@mcp.tool()
def wiki_list_pages() -> dict:
    """List all wiki pages (slug, title, parent, tags). Read-only.

    Use this first to discover what company knowledge is available."""
    return {"ok": True, "pages": store.list()}


if __name__ == "__main__":
    print(f"[wiki-mock-mcp] port={PORT} pages={len(store.list())} -> http://127.0.0.1:{PORT}/mcp")
    mcp.run(transport="streamable-http")
