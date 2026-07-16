"""Load a mock company wiki from markdown files with simple frontmatter.

Each page is a ``pages/<slug>.md`` file with an optional frontmatter block:

    ---
    slug: access-policy
    title: Политика доступов
    parent: onboarding
    tags: доступы, безопасность, backend
    ---
    <markdown body>

The store gives the connector three read operations: list, get-by-slug, and a
naive full-text search (which the real Yandex Wiki API does not offer).
"""
from __future__ import annotations

import pathlib
import re

PAGES_DIR = pathlib.Path(__file__).parent / "pages"


def _parse(md: str) -> tuple[dict, str]:
    meta: dict = {}
    body = md
    if md.startswith("---"):
        end = md.find("\n---", 3)
        if end != -1:
            for line in md[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = md[end + 4:].lstrip("\n")
    return meta, body


class WikiStore:
    def __init__(self, pages_dir=PAGES_DIR):
        self.pages: dict = {}
        for p in sorted(pathlib.Path(pages_dir).glob("*.md")):
            meta, body = _parse(p.read_text(encoding="utf-8"))
            slug = meta.get("slug") or p.stem
            self.pages[slug] = {
                "slug": slug,
                "title": meta.get("title") or slug,
                "parent": meta.get("parent") or "",
                "tags": [t.strip() for t in (meta.get("tags") or "").split(",") if t.strip()],
                "body": body,
            }

    def get(self, slug: str):
        return self.pages.get(slug)

    def list(self):
        return [{"slug": p["slug"], "title": p["title"], "parent": p["parent"], "tags": p["tags"]}
                for p in self.pages.values()]

    def search(self, query: str, limit: int = 5):
        terms = [t for t in re.split(r"\s+", query.lower().strip()) if t]
        if not terms:
            return []
        scored = []
        for p in self.pages.values():
            title = p["title"].lower()
            hay = f"{title} {' '.join(p['tags']).lower()} {p['body'].lower()}"
            score = sum(hay.count(t) for t in terms) + 5 * sum(title.count(t) for t in terms)
            if score > 0:
                scored.append((score, {"slug": p["slug"], "title": p["title"],
                                       "snippet": self._snippet(p["body"], terms)}))
        scored.sort(key=lambda x: -x[0])
        return [s for _, s in scored[:limit]]

    @staticmethod
    def _snippet(body: str, terms: list, width: int = 160) -> str:
        low = body.lower()
        idx = next((low.find(t) for t in terms if low.find(t) != -1), -1)
        if idx == -1:
            return body[:width].strip().replace("\n", " ")
        start = max(0, idx - 40)
        return ("…" if start > 0 else "") + body[start:start + width].strip().replace("\n", " ") + "…"
