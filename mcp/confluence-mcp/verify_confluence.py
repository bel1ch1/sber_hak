"""Проверка подключения к Confluence Cloud. Секрет НЕ печатает (маскирует).
Показывает список space — оттуда возьми CONFLUENCE_SPACE_KEY."""
import os
import pathlib
import sys


def load_env(path: pathlib.Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.split("#", 1)[0].strip())


load_env(pathlib.Path(__file__).parent / ".env")

from confluence_client import ConfluenceClient, ConfluenceError  # noqa: E402

base = os.environ.get("CONFLUENCE_BASE_URL", "")
email = os.environ.get("CONFLUENCE_EMAIL", "")
token = os.environ.get("CONFLUENCE_API_TOKEN", "")
space = os.environ.get("CONFLUENCE_SPACE_KEY", "")


def mask(s: str) -> str:
    return (s[:3] + "…" + s[-2:]) if len(s) > 6 else "(пусто)"


print(f"base_url = {base or '(пусто)'}")
print(f"email    = {email or '(пусто)'}")
print(f"token    = {mask(token)}")
print(f"space    = {space or '(не задан — выбери из списка ниже)'}")

if not all([base, email, token]):
    print("\n❌ Заполни CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN в .env")
    sys.exit(1)

try:
    c = ConfluenceClient(base, email, token)
    spaces = c.list_spaces()
    print(f"\n✅ Подключение работает. Найдено space: {len(spaces)}")
    for s in spaces:
        print(f"   - key={s['key']!r}  name={s['name']!r}")
    if space:
        pages = c.list_pages(space)
        print(f"\nСтраниц в space {space!r}: {len(pages)}")
        for p in pages[:10]:
            print(f"   - [{p['id']}] {p['title']}")
except ConfluenceError as e:
    print(f"\n❌ Не подключилось: {e}")
    print("Подсказки: Confluence включён на сайте? base_url оканчивается на /wiki? "
          "email/токен те же, что для Jira (обычный токен, не scoped)?")
    sys.exit(1)
