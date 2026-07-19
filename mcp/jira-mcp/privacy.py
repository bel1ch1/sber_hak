"""Mask Jira PII before values leave the MCP toward the agent."""
from __future__ import annotations

import re
from typing import Any

from accounts import AccountDirectory

_EXT_HIDDEN = "(hidden_user)"


def _escape(s: str) -> str:
    return re.escape(s)


class JiraPrivacy:
    def __init__(self, accounts: AccountDirectory):
        self.accounts = accounts

    def mask_assignee(self, assignee: Any) -> str | None:
        """Jira assignee object / accountId / displayName → opaque id."""
        if assignee is None or assignee == "":
            return None
        if isinstance(assignee, str):
            oid = self.accounts.opaque_for_jira_account_id(assignee)
            if oid:
                return oid
            oid = self.accounts.opaque_for_email(assignee)
            if oid:
                return oid
            oid = self.accounts.opaque_for_display_name(assignee)
            return oid or _EXT_HIDDEN
        if isinstance(assignee, dict):
            aid = (assignee.get("accountId") or "").strip()
            if aid:
                oid = self.accounts.opaque_for_jira_account_id(aid)
                if oid:
                    return oid
            email = (assignee.get("emailAddress") or "").strip()
            if email:
                oid = self.accounts.opaque_for_email(email)
                if oid:
                    return oid
            name = (assignee.get("displayName") or "").strip()
            if name:
                oid = self.accounts.opaque_for_display_name(name)
                if oid:
                    return oid
            return _EXT_HIDDEN
        return _EXT_HIDDEN

    def mask_text(self, text: str) -> str:
        """Replace known emails / display names / accountIds in free text."""
        if not text:
            return text
        pairs: list[tuple[str, str]] = []
        for acc in self.accounts.by_id.values():
            if acc.jira_account_id:
                pairs.append((acc.jira_account_id, acc.id))
            if acc.email and "@" in acc.email:
                pairs.append((acc.email, acc.id))
            if acc.display_name:
                pairs.append((acc.display_name, acc.id))
        # Longer needles first
        pairs.sort(key=lambda p: len(p[0]), reverse=True)
        out = text
        for needle, oid in pairs:
            if "@" in needle:
                re_pat = re.compile(
                    rf"(?<![A-Za-z0-9._%+-]){_escape(needle)}(?![A-Za-z0-9._%+-])",
                    re.I,
                )
            else:
                re_pat = re.compile(
                    rf"(?<![A-Za-z0-9_]){_escape(needle)}(?![A-Za-z0-9_])",
                    re.I,
                )
            out = re_pat.sub(oid, out)
        return out

    def _hire_id_from_labels(self, labels: Any) -> str | None:
        if not isinstance(labels, list):
            return None
        for lab in labels:
            if not isinstance(lab, str) or not lab.startswith("onboarding:"):
                continue
            oid = lab.split(":", 1)[1].strip()
            if oid and oid in self.accounts.by_id:
                return oid
        return None

    def _same_identity(self, id_a: str, id_b: str) -> bool:
        a = self.accounts.by_id.get(id_a)
        b = self.accounts.by_id.get(id_b)
        if not a or not b:
            return False
        if a.jira_account_id and b.jira_account_id:
            return a.jira_account_id == b.jira_account_id
        if a.email and b.email and "@" in a.email and "@" in b.email:
            return a.email.lower() == b.email.lower()
        return id_a == id_b

    def mask_issue(self, issue: dict) -> dict:
        out = dict(issue)
        hire_id = self._hire_id_from_labels(out.get("labels"))
        if "assignee" in out:
            masked = self.mask_assignee(out.pop("assignee"))
            # Shared demo Jira user first-wins to usr_employee; prefer onboarding:<hire_id>.
            if hire_id and masked and self._same_identity(hire_id, masked):
                out["assignee_id"] = hire_id
            else:
                out["assignee_id"] = masked
        elif "assignee_id" in out and isinstance(out["assignee_id"], str):
            # already opaque or raw accountId
            if out["assignee_id"] not in self.accounts.by_id:
                masked = self.mask_assignee(out["assignee_id"])
                if hire_id and masked and self._same_identity(hire_id, masked):
                    out["assignee_id"] = hire_id
                else:
                    out["assignee_id"] = masked
            elif hire_id and self._same_identity(hire_id, out["assignee_id"]):
                out["assignee_id"] = hire_id
        if isinstance(out.get("summary"), str):
            out["summary"] = self.mask_text(out["summary"])
        if isinstance(out.get("description"), str):
            out["description"] = self.mask_text(out["description"])
        return out

    def mask_issues(self, issues: list) -> list:
        return [self.mask_issue(it) if isinstance(it, dict) else it for it in issues]

    def mask_payload(self, payload: Any) -> Any:
        """Recursively mask known PII strings in tool responses."""
        if isinstance(payload, dict):
            out = {}
            for k, v in payload.items():
                # Already-opaque note from create_onboarding_plan preview
                if k == "assignee" and isinstance(v, dict) and "assignee_id" in v and "accountId" not in v:
                    out[k] = {"assignee_id": v.get("assignee_id")}
                    if v.get("warning"):
                        out[k]["warning"] = self.mask_text(str(v["warning"]))
                    continue
                if k in {"assignee", "reporter", "creator"}:
                    out["assignee_id" if k == "assignee" else f"{k}_id"] = self.mask_assignee(v)
                elif k in {"email", "emailAddress", "displayName", "accountId"}:
                    continue  # drop raw identity fields
                elif k in {"issues", "existing"} and isinstance(v, list):
                    out[k] = self.mask_issues(v)
                elif isinstance(v, str) and k in {"summary", "description", "note", "error"}:
                    out[k] = self.mask_text(v)
                else:
                    out[k] = self.mask_payload(v)
            return out
        if isinstance(payload, list):
            return [self.mask_payload(x) for x in payload]
        if isinstance(payload, str):
            return self.mask_text(payload)
        return payload
