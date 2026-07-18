"""Buddy matching MCP — ranks mentor candidates; PII stays in accounts.csv."""
from __future__ import annotations

import csv
import os
import pathlib
from dataclasses import dataclass

from mcp.server.fastmcp import FastMCP

HERE = pathlib.Path(__file__).parent
HOST = os.environ.get("MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("MCP_PORT", "3008"))
PRIMARY_BUDDY_ID = os.environ.get("BUDDY_PRIMARY_ID", "usr_buddy").strip() or "usr_buddy"


@dataclass(frozen=True)
class Buddy:
    id: str
    email: str
    label: str
    role: str
    team: str
    seniority: str
    can_mentor: bool


def _load_buddies(path: pathlib.Path) -> list[Buddy]:
    if not path.exists():
        return []
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines()
             if ln.strip() and not ln.strip().startswith("#")]
    if not lines:
        return []
    reader = csv.DictReader(lines)
    out: list[Buddy] = []
    for row in reader:
        i = (row.get("id") or "").strip()
        email = (row.get("email") or "").strip().lower()
        if not i or "@" not in email:
            continue
        can = (row.get("can_mentor") or "true").strip().lower() in ("1", "true", "yes", "y")
        out.append(Buddy(
            id=i,
            email=email,
            label=(row.get("label") or "").strip(),
            role=(row.get("role") or "").strip() or "unknown",
            team=(row.get("team") or "").strip() or "unknown",
            seniority=(row.get("seniority") or "").strip() or "middle",
            can_mentor=can,
        ))
    return out


ACCOUNTS_PATH = pathlib.Path(os.environ.get("BUDDY_ACCOUNTS_CSV", "").strip() or (HERE / "accounts.csv"))
BUDDIES = [b for b in _load_buddies(ACCOUNTS_PATH) if b.can_mentor]

mcp = FastMCP("buddy", host=HOST, port=PORT)


def _public(b: Buddy, score: int, reasons: list[str], rank: int) -> dict:
    """Never expose email/label to the agent."""
    return {
        "rank": rank,
        "buddy_id": b.id,
        "role": b.role,
        "team": b.team,
        "seniority": b.seniority,
        "score": score,
        "reasons": reasons,
    }


@mcp.tool()
def buddy_verify() -> dict:
    """Проверка каталога бадди: число записей и id PRIMARY (без email)."""
    ids = [b.id for b in BUDDIES]
    return {
        "ok": True,
        "buddy_count": len(BUDDIES),
        "primary_id": PRIMARY_BUDDY_ID,
        "primary_present": PRIMARY_BUDDY_ID in ids,
        "ids": ids,
    }


@mcp.tool()
def buddy_match(role: str = "backend", team: str = "", employee_id: str = "",
                limit: int = 3) -> dict:
    """Ранжирует кандидатов в бадди. READ-ONLY.

    Всегда возвращает ровно до `limit` кандидатов (по умолчанию 3).
    Наиболее подходящий (rank=1) — всегда PRIMARY id из accounts.csv
    (по умолчанию usr_buddy — демо-аккаунт). Остальные — декой-кандидаты.
    Агент видит только buddy_id и рабочие атрибуты (role/team/seniority), без email."""
    lim = max(1, min(int(limit or 3), 10))
    role_l = (role or "").strip().lower()
    team_l = (team or "").strip().lower()

    primary = next((b for b in BUDDIES if b.id == PRIMARY_BUDDY_ID), None)
    others = [b for b in BUDDIES if b.id != PRIMARY_BUDDY_ID]

    scored: list[tuple[Buddy, int, list[str]]] = []
    if primary:
        reasons = ["primary_demo_account", "recommended_for_pipeline_test"]
        if role_l and role_l in primary.role.lower():
            reasons.append("role_overlap")
        if team_l and team_l in primary.team.lower():
            reasons.append("same_team")
        scored.append((primary, 100, reasons))

    for b in others:
        score = 40
        reasons = ["alternate_candidate"]
        if role_l and role_l in b.role.lower():
            score += 25
            reasons.append("role_overlap")
        if team_l and team_l in b.team.lower():
            score += 20
            reasons.append("same_team")
        if b.seniority in ("senior", "lead"):
            score += 10
            reasons.append("seniority")
        scored.append((b, score, reasons))

    # Keep primary first, then others by score
    head = [x for x in scored if x[0].id == PRIMARY_BUDDY_ID]
    tail = sorted([x for x in scored if x[0].id != PRIMARY_BUDDY_ID], key=lambda t: -t[1])
    ordered = (head + tail)[:lim]

    candidates = [_public(b, score, reasons, i + 1) for i, (b, score, reasons) in enumerate(ordered)]
    return {
        "ok": True,
        "query": {"role": role, "team": team, "employee_id": employee_id or None},
        "recommended_buddy_id": candidates[0]["buddy_id"] if candidates else None,
        "candidates": candidates,
        "note": "Pick recommended_buddy_id (PRIMARY) for the demo pipeline; notify via mail MCP with that id.",
    }


@mcp.tool()
def buddy_get_profile(buddy_id: str) -> dict:
    """Рабочий профиль бадди по opaque id. Без email/ФИО."""
    bid = (buddy_id or "").strip()
    b = next((x for x in BUDDIES if x.id == bid), None)
    if not b:
        return {"ok": False, "error": f"UnknownBuddyId: {bid!r}", "available": [x.id for x in BUDDIES]}
    return {
        "ok": True,
        "profile": {
            "buddy_id": b.id,
            "role": b.role,
            "team": b.team,
            "seniority": b.seniority,
            "can_mentor": b.can_mentor,
        },
    }


if __name__ == "__main__":
    print(f"[buddy-mcp] host={HOST} port={PORT} buddies={len(BUDDIES)} "
          f"primary={PRIMARY_BUDDY_ID} -> http://{HOST}:{PORT}/mcp")
    mcp.run(transport="streamable-http")
