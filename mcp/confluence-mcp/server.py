"""Confluence (real wiki) MCP connector for the Ouroboros onboarding agent.

Reads company knowledge from a real Confluence Cloud space so the agent works
against a genuine corporate wiki. Reuses the Atlassian account + API token from
the Jira connector (Basic auth).

Runs as a streamable-HTTP MCP server. Register in Ouroboros
Settings -> Advanced -> MCP as:

    {"id": "confluence", "name": "confluence", "url": "http://localhost:9103/mcp",
     "transport": "streamable_http", "enabled": true}

Config via environment (see config.example.env):
    CONFLUENCE_BASE_URL=https://<site>.atlassian.net/wiki
    CONFLUENCE_EMAIL=you@example.com
    CONFLUENCE_API_TOKEN=...
    CONFLUENCE_SPACE_KEY=ONB        # default space for search/list
    MCP_PORT=9103
"""
from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from confluence_client import ConfluenceClient, ConfluenceError

PORT = int(os.environ.get("MCP_PORT", "9103"))
DEFAULT_SPACE = os.environ.get("CONFLUENCE_SPACE_KEY", "")


def _client():
    return ConfluenceClient(
        os.environ.get("CONFLUENCE_BASE_URL", ""),
        os.environ.get("CONFLUENCE_EMAIL", ""),
        os.environ.get("CONFLUENCE_API_TOKEN", ""),
    )


client = _client()
mcp = FastMCP("confluence", host="127.0.0.1", port=PORT)


@mcp.tool()
def confluence_list_spaces() -> dict:
    """List available Confluence spaces (key, name). Read-only."""
    try:
        return {"ok": True, "spaces": client.list_spaces()}
    except ConfluenceError as e:
        return {"ok": False, "error": str(e)}


@mcp.tool()
def confluence_list_pages(space_key: str = "") -> dict:
    """List pages in a Confluence space (id, title, url). Read-only.

    Defaults to the configured space (CONFLUENCE_SPACE_KEY) if space_key omitted."""
    try:
        return {"ok": True, "pages": client.list_pages(space_key or DEFAULT_SPACE)}
    except ConfluenceError as e:
        return {"ok": False, "error": str(e)}


@mcp.tool()
def confluence_search(query: str, space_key: str = "") -> dict:
    """Full-text (CQL) search across Confluence pages; returns id, title, url.
    Read-only. Defaults to the configured space unless space_key is given."""
    try:
        return {"ok": True, "results": client.search(query, space_key or DEFAULT_SPACE)}
    except ConfluenceError as e:
        return {"ok": False, "error": str(e)}


@mcp.tool()
def confluence_get_page(page_id: str) -> dict:
    """Read a Confluence page by id: title, space, plain-text content, url. Read-only."""
    try:
        return {"ok": True, "page": client.get_page(page_id)}
    except ConfluenceError as e:
        return {"ok": False, "error": str(e)}


@mcp.tool()
def confluence_create_page(space_key: str, title: str, body_markdown: str, parent_id: str = "") -> dict:
    """Create a Confluence page from markdown (headings, lists, tables, bold).
    Write operation. Returns the created page id and url."""
    try:
        return {"ok": True, "created": client.create_page(space_key, title, body_markdown, parent_id)}
    except ConfluenceError as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    print(f"[confluence-mcp] port={PORT} space={DEFAULT_SPACE or '(any)'} "
          f"-> http://127.0.0.1:{PORT}/mcp")
    mcp.run(transport="streamable-http")
