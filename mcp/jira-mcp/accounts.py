"""Opaque id → email directory for Jira assignee resolution (PII stays in MCP)."""
from __future__ import annotations

import csv
import os
import pathlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Account:
    id: str
    email: str
    label: str = ""


class AccountDirectory:
    def __init__(self, by_id: dict[str, Account]):
        self.by_id = by_id

    def email_for(self, account_id: str) -> str | None:
        acc = self.by_id.get((account_id or "").strip())
        return acc.email if acc else None


def load_accounts(path: pathlib.Path) -> AccountDirectory:
    by_id: dict[str, Account] = {}
    if not path.exists():
        return AccountDirectory(by_id)
    text = path.read_text(encoding="utf-8")
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    if not lines:
        return AccountDirectory(by_id)
    has_header = lines[0].lower().startswith("id,")
    reader = csv.DictReader(lines) if has_header else None
    if reader:
        for row in reader:
            i = (row.get("id") or "").strip()
            email = (row.get("email") or "").strip().lower()
            label = (row.get("label") or "").strip()
            if i and "@" in email:
                by_id[i] = Account(i, email, label)
    else:
        for ln in lines:
            parts = next(csv.reader([ln]))
            if len(parts) < 2:
                continue
            i, email = parts[0].strip(), parts[1].strip().lower()
            label = parts[2].strip() if len(parts) > 2 else ""
            if i and "@" in email:
                by_id[i] = Account(i, email, label)
    return AccountDirectory(by_id)


def accounts_path(here: pathlib.Path) -> pathlib.Path:
    raw = os.environ.get("JIRA_ACCOUNTS_CSV", "").strip()
    return pathlib.Path(raw) if raw else here / "accounts.csv"
