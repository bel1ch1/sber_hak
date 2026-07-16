"""Проверка подключения к реальной Jira Cloud. Секрет НЕ печатает (маскирует)."""
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
        # срезаем возможный inline-комментарий и пробелы
        os.environ.setdefault(k.strip(), v.split("#", 1)[0].strip())


load_env(pathlib.Path(__file__).parent / ".env")

from jira_client import JiraError, RealJiraClient  # noqa: E402

base = os.environ.get("JIRA_BASE_URL", "")
email = os.environ.get("JIRA_EMAIL", "")
token = os.environ.get("JIRA_API_TOKEN", "")
pk = os.environ.get("JIRA_PROJECT_KEY", "")


def mask(s: str) -> str:
    return (s[:3] + "…" + s[-2:]) if len(s) > 6 else "(пусто)"


print(f"base_url = {base or '(пусто)'}")
print(f"email    = {email or '(пусто)'}")
print(f"token    = {mask(token)}")
print(f"project  = {pk or '(пусто)'}")

if not all([base, email, token, pk]):
    print("\n❌ Заполни все поля в .env (base_url, email, token, project).")
    sys.exit(1)

try:
    proj = RealJiraClient(base, email, token).get_project(pk)
    print(f"\n✅ Подключение работает. Проект: {proj['name']} ({proj['key']}), "
          f"типы задач: {proj['issue_types']}")
except JiraError as e:
    print(f"\n❌ Не подключилось: {e}")
    print("Подсказки: проверь URL сайта, что email тот же что в аккаунте, "
          "что токен обычный (Create API token, БЕЗ scopes), и что ключ проекта верный.")
    sys.exit(1)
