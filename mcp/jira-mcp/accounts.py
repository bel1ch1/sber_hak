"""Opaque id → email / Jira accountId directory (PII stays in MCP)."""
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
    jira_account_id: str = ""
    display_name: str = ""


class AccountDirectory:
    def __init__(self, by_id: dict[str, Account]):
        self.by_id = by_id
        self.by_jira_account_id: dict[str, str] = {}
        self.by_email: dict[str, str] = {}
        self.by_display_name: dict[str, str] = {}
        for acc in by_id.values():
            if acc.jira_account_id and acc.jira_account_id not in self.by_jira_account_id:
                self.by_jira_account_id[acc.jira_account_id] = acc.id
            if acc.email and "@" in acc.email and acc.email not in self.by_email:
                self.by_email[acc.email.lower()] = acc.id
            dn = (acc.display_name or "").strip().lower()
            if dn and dn not in self.by_display_name:
                self.by_display_name[dn] = acc.id

    def get(self, account_id: str) -> Account | None:
        return self.by_id.get((account_id or "").strip())

    def email_for(self, account_id: str) -> str | None:
        acc = self.get(account_id)
        return acc.email if acc else None

    def jira_account_id_for(self, account_id: str) -> str | None:
        acc = self.get(account_id)
        if not acc:
            return None
        return acc.jira_account_id or None

    def opaque_for_jira_account_id(self, jira_account_id: str) -> str | None:
        return self.by_jira_account_id.get((jira_account_id or "").strip())

    def opaque_for_email(self, email: str) -> str | None:
        return self.by_email.get((email or "").strip().lower())

    def opaque_for_display_name(self, name: str) -> str | None:
        return self.by_display_name.get((name or "").strip().lower())


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
            jira_account_id = (row.get("jira_account_id") or "").strip()
            display_name = (row.get("display_name") or "").strip()
            if i and ("@" in email or jira_account_id):
                by_id[i] = Account(i, email, label, jira_account_id, display_name)
    else:
        for ln in lines:
            parts = next(csv.reader([ln]))
            if len(parts) < 2:
                continue
            i, email = parts[0].strip(), parts[1].strip().lower()
            label = parts[2].strip() if len(parts) > 2 else ""
            jira_account_id = parts[3].strip() if len(parts) > 3 else ""
            display_name = parts[4].strip() if len(parts) > 4 else ""
            if i and ("@" in email or jira_account_id):
                by_id[i] = Account(i, email, label, jira_account_id, display_name)
    return AccountDirectory(by_id)


def accounts_path(here: pathlib.Path) -> pathlib.Path:
    raw = os.environ.get("JIRA_ACCOUNTS_CSV", "").strip()
    return pathlib.Path(raw) if raw else here / "accounts.csv"
