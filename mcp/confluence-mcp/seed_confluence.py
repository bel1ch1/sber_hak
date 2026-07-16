"""(Опционально) Залить наши 7 мок-страниц в Confluence через API.

Читает hackathon/wiki_mock_mcp/pages/*.md и создаёт страницы в space
CONFLUENCE_SPACE_KEY. Идемпотентно: страница с таким же title пропускается.
Запуск:  ../.venv/bin/python seed_confluence.py
Очистка: ../.venv/bin/python seed_confluence.py --wipe   (удалит созданные seed-страницы)
"""
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
PAGES = HERE.parent / "wiki_mock_mcp" / "pages"


def load_env(path: pathlib.Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.split("#", 1)[0].strip())


def parse(md: str):
    meta, body = {}, md
    if md.startswith("---"):
        end = md.find("\n---", 3)
        if end != -1:
            for line in md[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = md[end + 4:].lstrip("\n")
    return meta, body


def main() -> int:
    load_env(HERE / ".env")
    from confluence_client import ConfluenceClient, ConfluenceError
    space = os.environ.get("CONFLUENCE_SPACE_KEY", "")
    if not space:
        print("❌ Задай CONFLUENCE_SPACE_KEY в .env"); return 1
    c = ConfluenceClient(os.environ["CONFLUENCE_BASE_URL"], os.environ["CONFLUENCE_EMAIL"],
                         os.environ["CONFLUENCE_API_TOKEN"])
    existing = {p["title"]: p["id"] for p in c.list_pages(space)}

    if "--wipe" in sys.argv:
        seeded_titles = [parse(f.read_text(encoding="utf-8"))[0].get("title") or f.stem
                         for f in sorted(PAGES.glob("*.md"))]
        for title in seeded_titles:
            if title in existing:
                c.delete_page(existing[title]); print(f"  🗑  удалено: {title}")
        print("wipe готово"); return 0

    for f in sorted(PAGES.glob("*.md")):
        meta, body = parse(f.read_text(encoding="utf-8"))
        title = meta.get("title") or f.stem
        if title in existing:
            print(f"  ⏭  уже есть: {title}"); continue
        try:
            r = c.create_page(space, title, body)
            print(f"  ✅ создано: {title}  -> {r['url']}")
        except ConfluenceError as e:
            print(f"  ❌ {title}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
