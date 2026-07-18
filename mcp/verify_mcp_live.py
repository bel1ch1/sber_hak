#!/usr/bin/env python3
"""Live-проверка MCP tools *_verify через streamable HTTP.

Запуск:
  cd mcp/jira-mcp && uv run --with mcp python ..\\verify_mcp_live.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from typing import Any

try:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
except ImportError:
    print("Нужен пакет mcp: pip install 'mcp>=1.6,<2'  или  uv run --with mcp …", file=sys.stderr)
    sys.exit(2)


@dataclass(frozen=True)
class Target:
    name: str
    url: str
    tool: str
    arguments: dict[str, Any]


TARGETS: list[Target] = [
    Target("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_verify", {}),
    Target("confluence-mcp", "http://127.0.0.1:9103/mcp", "confluence_verify", {}),
    Target("yandex-calendar-mcp", "http://127.0.0.1:3004/mcp", "yandex_calendar_verify", {}),
    Target("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_verify", {}),
    Target("buddy-mcp", "http://127.0.0.1:3008/mcp", "buddy_verify", {}),
]

SKIPPED_NO_EXTERNAL_API = [
    ("wiki-mock-mcp", "локальные markdown pages/, нет внешнего API"),
    ("stepik-mcp", "локальный Excel-каталог, нет Stepik online API"),
]

REMOVED = [
    ("yandex-wiki-mcp", "отказ — wiki через wiki-mock / Confluence"),
    ("onboarding-mcp", "отказ — логика онбординга вне отдельного MCP"),
]


def _text_from_result(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", []) or []:
        t = getattr(block, "text", None)
        if t:
            parts.append(t)
    if parts:
        return "\n".join(parts)
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return json.dumps(structured, ensure_ascii=False)
    return repr(result)


def _looks_ok(payload: str) -> bool:
    s = payload.strip()
    try:
        data = json.loads(s)
        if isinstance(data, dict):
            if data.get("ok") is True:
                return True
            if data.get("ok") is False:
                return False
            if "error" in data:
                return False
            if any(k in data for k in ("project", "folder_count", "calendar_url", "space_count", "spaces")):
                return True
    except json.JSONDecodeError:
        pass
    low = s.lower()
    if '"ok": true' in low or '"ok":true' in low:
        return True
    if "error" in low or "failed" in low or "unauthorized" in low:
        return False
    return "ok" in low


async def call_verify(t: Target, timeout_s: float = 45.0) -> tuple[str, str]:
    try:
        async with asyncio.timeout(timeout_s):
            async with streamablehttp_client(t.url) as (read, write, _get_session_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    names = {x.name for x in tools.tools}
                    if t.tool not in names:
                        return "TOOL_MISSING", f"tool {t.tool!r} not registered; have={sorted(names)}"
                    result = await session.call_tool(t.tool, t.arguments)
                    text = _text_from_result(result)
                    is_error = bool(getattr(result, "isError", False))
                    if is_error or not _looks_ok(text):
                        return "FAIL", text[:800]
                    return "PASS", text[:800]
    except TimeoutError:
        return "NO_RESPONSE", f"timeout after {timeout_s}s (creds/сеть?)"
    except Exception as e:
        return "NO_RESPONSE", f"{type(e).__name__}: {e}"


async def main() -> int:
    print("=== Удалены / не используются ===")
    for name, reason in REMOVED:
        print(f"  GONE  {name}: {reason}")
    print("=== MCP без *_verify (нет внешнего API) ===")
    for name, reason in SKIPPED_NO_EXTERNAL_API:
        print(f"  SKIP  {name}: {reason}")

    print("\n=== Вызовы *_verify ===")
    for t in TARGETS:
        print(f"  {t.name}: {t.tool}({json.dumps(t.arguments)}) @ {t.url}")

    print("\n=== Результаты ===")
    worst = 0
    for t in TARGETS:
        status, detail = await call_verify(t)
        mark = {"PASS": "OK", "FAIL": "!!", "NO_RESPONSE": "??", "TOOL_MISSING": "--"}.get(status, status)
        print(f"\n[{mark}] {t.name} → {status}")
        print(detail if len(detail) < 500 else detail[:500] + "…")
        if status == "PASS":
            continue
        if status in ("NO_RESPONSE", "TOOL_MISSING"):
            worst = max(worst, 2)
        else:
            worst = max(worst, 1)

    print("\n=== Итог ===")
    if worst == 0:
        print("Все verify-вызовы прошли.")
        return 0
    if worst == 1:
        print("Есть FAIL (часто креды/права). Траблшутинг не делаем — см. детали выше.")
        return 1
    print("Есть NO_RESPONSE / TOOL_MISSING (MCP не ответил или нет tool — пересобери образ).")
    return 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
