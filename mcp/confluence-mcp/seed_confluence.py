"""Залить мок-страницы wiki-mock в Confluence через API.

Читает mcp/wiki-mock-mcp/pages/*.md и создаёт/обновляет страницы в space
CONFLUENCE_SPACE_KEY. По умолчанию обновляет существующие с тем же title.
Запуск:  python seed_confluence.py
         python seed_confluence.py --create-only   # не трогать существующие
Очистка: python seed_confluence.py --wipe
"""
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
PAGES = HERE.parent / "wiki-mock-mcp" / "pages"


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
    load_env(HERE.parent / "jira-mcp" / ".env")
    # Fallback: reuse Jira Atlassian creds if Confluence-specific unset
    if not os.environ.get("CONFLUENCE_BASE_URL") and os.environ.get("JIRA_BASE_URL"):
        jira = os.environ["JIRA_BASE_URL"].rstrip("/")
        os.environ["CONFLUENCE_BASE_URL"] = jira if jira.endswith("/wiki") else f"{jira}/wiki"
    if not os.environ.get("CONFLUENCE_EMAIL") and os.environ.get("JIRA_EMAIL"):
        os.environ["CONFLUENCE_EMAIL"] = os.environ["JIRA_EMAIL"]
    if not os.environ.get("CONFLUENCE_API_TOKEN") and os.environ.get("JIRA_API_TOKEN"):
        os.environ["CONFLUENCE_API_TOKEN"] = os.environ["JIRA_API_TOKEN"]

    from confluence_client import ConfluenceClient, ConfluenceError

    space = os.environ.get("CONFLUENCE_SPACE_KEY", "") or os.environ.get("JIRA_PROJECT_KEY", "")
    if not space:
        print("Задай CONFLUENCE_SPACE_KEY (или JIRA_PROJECT_KEY) в .env")
        return 1
    if not PAGES.is_dir():
        print(f"Нет каталога страниц: {PAGES}")
        return 1

    base = os.environ.get("CONFLUENCE_BASE_URL") or ""
    email = os.environ.get("CONFLUENCE_EMAIL") or ""
    token = os.environ.get("CONFLUENCE_API_TOKEN") or ""
    c = ConfluenceClient(base, email, token)
    existing = {p["title"]: p["id"] for p in c.list_pages(space)}
    create_only = "--create-only" in sys.argv

    if "--wipe" in sys.argv:
        seeded_titles = [
            parse(f.read_text(encoding="utf-8"))[0].get("title") or f.stem
            for f in sorted(PAGES.glob("*.md"))
        ]
        for title in seeded_titles:
            if title in existing:
                c.delete_page(existing[title])
                print(f"  удалено: {title}")
        print("wipe готово")
        return 0

    for f in sorted(PAGES.glob("*.md")):
        meta, body = parse(f.read_text(encoding="utf-8"))
        title = meta.get("title") or f.stem
        try:
            if title in existing:
                if create_only:
                    print(f"  пропуск (уже есть): {title}")
                    continue
                r = c.update_page(existing[title], title, body)
                print(f"  обновлено: {title}  -> {r['url']}")
            else:
                r = c.create_page(space, title, body)
                print(f"  создано: {title}  -> {r['url']}")
        except ConfluenceError as e:
            print(f"  ошибка {title}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
