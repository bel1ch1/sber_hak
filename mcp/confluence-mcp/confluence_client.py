"""Confluence Cloud REST client for the Ouroboros wiki connector.

Reuses the same Atlassian account + API token as the Jira connector
(Basic auth: email + token). Confluence Cloud lives under ``/wiki``, so the
base URL is ``https://<site>.atlassian.net/wiki`` and the REST root is
``<base>/rest/api``.

Implements the small surface the onboarding agent needs: list spaces, list
pages in a space, read a page (storage XHTML -> plain text), CQL text search,
and (bonus) create/delete a page so the wiki can be seeded via API.
"""
from __future__ import annotations

import html
import re

import httpx


class ConfluenceError(RuntimeError):
    """Any Confluence backend failure, surfaced to the agent as a clean message."""


def storage_to_text(xhtml: str) -> str:
    """Cheap Confluence-storage (XHTML) -> readable plain text."""
    if not xhtml:
        return ""
    t = re.sub(r"(?i)</(p|div|h[1-6]|li|tr)>", "\n", xhtml)
    t = re.sub(r"(?i)<li[^>]*>", "- ", t)
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)          # drop remaining tags
    t = html.unescape(t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def text_to_storage(md: str) -> str:
    """Minimal markdown -> Confluence storage (XHTML). Handles headings,
    bullet lists, simple tables, bold, and paragraphs — enough to seed pages."""
    out, in_ul, in_tbl = [], False, False

    def close_ul():
        nonlocal in_ul
        if in_ul:
            out.append("</ul>")
            in_ul = False

    def close_tbl():
        nonlocal in_tbl
        if in_tbl:
            out.append("</tbody></table>")
            in_tbl = False

    def inline(s: str) -> str:
        s = html.escape(s)
        return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            close_ul(); close_tbl()
            continue
        m = re.match(r"(#{1,6})\s+(.*)", line)
        if m:
            close_ul(); close_tbl()
            lvl = min(len(m.group(1)), 6)
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        if line.lstrip().startswith("- "):
            close_tbl()
            if not in_ul:
                out.append("<ul>"); in_ul = True
            out.append(f"<li>{inline(line.lstrip()[2:])}</li>")
            continue
        if line.lstrip().startswith("|") and line.count("|") >= 2:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(set(c) <= {"-", ":", " "} for c in cells):  # separator row
                continue
            close_ul()
            if not in_tbl:
                out.append("<table><tbody>"); in_tbl = True
            out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            continue
        close_ul(); close_tbl()
        out.append(f"<p>{inline(line)}</p>")
    close_ul(); close_tbl()
    return "".join(out)


class ConfluenceClient:
    def __init__(self, base_url: str, email: str, api_token: str, timeout: float = 30.0):
        if not base_url:
            raise ConfluenceError("CONFLUENCE_BASE_URL is required")
        if not (email and api_token):
            raise ConfluenceError("CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN are required")
        self.base_url = base_url.rstrip("/")
        self._api = f"{self.base_url}/rest/api"
        self._client = httpx.Client(
            auth=httpx.BasicAuth(email, api_token),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=timeout,
        )

    def _req(self, method: str, path: str, **kw) -> httpx.Response:
        r = self._client.request(method, f"{self._api}{path}", **kw)
        if r.status_code >= 400:
            raise ConfluenceError(f"{method} {path} -> {r.status_code}: {r.text[:400]}")
        return r

    def web_url(self, page_id: str) -> str:
        return f"{self.base_url}/pages/viewpage.action?pageId={page_id}"

    def list_spaces(self):
        d = self._req("GET", "/space", params={"limit": 50}).json()
        return [{"key": s.get("key"), "name": s.get("name"), "id": s.get("id")} for s in d.get("results", [])]

    def list_pages(self, space_key: str, limit: int = 100):
        d = self._req("GET", "/content", params={
            "spaceKey": space_key, "type": "page", "limit": limit, "expand": "version"}).json()
        return [{"id": p.get("id"), "title": p.get("title"), "url": self.web_url(p.get("id"))}
                for p in d.get("results", [])]

    def get_page(self, page_id: str):
        d = self._req("GET", f"/content/{page_id}", params={"expand": "body.storage,space,version"}).json()
        body = (d.get("body", {}).get("storage", {}) or {}).get("value", "")
        return {"id": d.get("id"), "title": d.get("title"),
                "space": (d.get("space") or {}).get("key"),
                "text": storage_to_text(body), "url": self.web_url(d.get("id"))}

    def search(self, query: str, space_key: str = "", limit: int = 8):
        safe = query.replace('"', '\\"')
        cql = f'type=page AND text ~ "{safe}"'
        if space_key:
            cql = f'space="{space_key}" AND ' + cql
        d = self._req("GET", "/content/search", params={"cql": cql, "limit": limit}).json()
        return [{"id": p.get("id"), "title": p.get("title"), "url": self.web_url(p.get("id"))}
                for p in d.get("results", [])]

    def create_page(self, space_key: str, title: str, body_md: str, parent_id: str = ""):
        payload = {
            "type": "page", "title": title, "space": {"key": space_key},
            "body": {"storage": {"value": text_to_storage(body_md), "representation": "storage"}},
        }
        if parent_id:
            payload["ancestors"] = [{"id": parent_id}]
        d = self._req("POST", "/content", json=payload).json()
        return {"id": d.get("id"), "title": d.get("title"), "url": self.web_url(d.get("id"))}

    def delete_page(self, page_id: str):
        self._req("DELETE", f"/content/{page_id}")
