// obfuscation.ts — the PII boundary between the agent and real email addresses.
//
// The agent works only with opaque recipient IDs. This module:
//   • resolveRecipients(ids) — IDs -> real emails, server-side, for sending.
//   • maskAddress(es)        — real emails -> IDs, so returned mail never
//                              contains a real address (or a display name).
//
// Two ID sources:
//   1. The curated directory CSV (loadRecipientDirectory) — stable IDs like
//      "usr_a1b2c3", added by hand when a person is onboarded.
//   2. Runtime "ext_<hash>" tokens minted the first time an *unknown* address
//      is observed in incoming mail. The token->email link is kept only in
//      process memory here; the agent can reply to "ext_9f3a1c22" without ever
//      seeing whose address it is. A token is a truncated SHA-256 of the email,
//      so the agent cannot fabricate a valid one it hasn't already seen.
//
// When disabled, every operation is a pass-through (legacy email-in/email-out).

import { createHash } from "node:crypto"
import type { RecipientDirectory } from "./recipient-directory.ts"

/** Reserved ID for the mailbox the MCP is authenticated as (the "from" account). */
export const SELF_ID = "self"
const EXT_PREFIX = "ext_"

export interface Obfuscator {
  readonly enabled: boolean
  /** Register the authenticated login so it masks to SELF_ID in results. */
  registerSelf(login: string): void
  /** Resolve agent-supplied IDs to real emails. Order preserved for resolved ones. */
  resolveRecipients(ids: string[]): { emails: string[]; unknown: string[] }
  /**
   * Expand opaque ids in free text (subject/body) to real emails/logins before SMTP send.
   * Agent keeps writing ids; recipients see addresses. Unknown tokens left unchanged.
   */
  expandIdsInText(text: string): string
  /** Mask a single "Name <email>" / "email" address into its ID. */
  maskAddress(addr: string): string
  maskAddresses(addrs: string[]): string[]
  maskListItems<T extends { from: string[]; to: string[] }>(items: T[]): T[]
  maskMessage<T extends { from: string[]; to: string[]; cc: string[] }>(msg: T): T
  maskSendResult<T extends { accepted: string[]; rejected: string[] }>(r: T): T
}

/** Extracts the bare email from "Name <email>" or "email". Null if none. */
export function extractEmail(addr: string): string | null {
  if (!addr) return null
  const angle = /<([^>]+)>/.exec(addr)
  const candidate = (angle ? angle[1] : addr).trim()
  return candidate.includes("@") ? candidate : null
}

function extToken(email: string): string {
  const h = createHash("sha256").update(email.toLowerCase(), "utf8").digest("hex")
  return EXT_PREFIX + h.slice(0, 8)
}

class DirectoryObfuscator implements Obfuscator {
  readonly enabled = true
  private selfEmail: string | null = null
  /** ext_<hash> -> real email, minted at runtime for unknown senders. */
  private readonly extToEmail = new Map<string, string>()

  constructor(private readonly dir: RecipientDirectory) {}

  registerSelf(login: string): void {
    this.selfEmail = login?.trim() ? login.trim().toLowerCase() : null
  }

  private maskEmail(email: string): string {
    const key = email.toLowerCase()
    if (this.selfEmail && key === this.selfEmail) return SELF_ID
    const known = this.dir.byEmail.get(key)
    if (known) return known
    const token = extToken(key)
    if (!this.extToEmail.has(token)) this.extToEmail.set(token, email)
    return token
  }

  maskAddress(addr: string): string {
    const email = extractEmail(addr)
    // Never fall through to the raw string: a display name is PII too.
    return email ? this.maskEmail(email) : "(hidden)"
  }

  maskAddresses(addrs: string[]): string[] {
    return addrs.map((a) => this.maskAddress(a))
  }

  maskListItems<T extends { from: string[]; to: string[] }>(items: T[]): T[] {
    return items.map((it) => ({
      ...it,
      from: this.maskAddresses(it.from),
      to: this.maskAddresses(it.to),
    }))
  }

  maskMessage<T extends { from: string[]; to: string[]; cc: string[] }>(msg: T): T {
    return {
      ...msg,
      from: this.maskAddresses(msg.from),
      to: this.maskAddresses(msg.to),
      cc: this.maskAddresses(msg.cc),
    }
  }

  maskSendResult<T extends { accepted: string[]; rejected: string[] }>(r: T): T {
    return {
      ...r,
      accepted: this.maskAddresses(r.accepted),
      rejected: this.maskAddresses(r.rejected),
    }
  }

  resolveRecipients(ids: string[]): { emails: string[]; unknown: string[] } {
    const emails: string[] = []
    const unknown: string[] = []
    for (const raw of ids) {
      const id = raw.trim()
      if (id === SELF_ID && this.selfEmail) {
        emails.push(this.selfEmail)
        continue
      }
      const entry = this.dir.byId.get(id)
      if (entry) {
        emails.push(entry.email)
        continue
      }
      const ext = this.extToEmail.get(id)
      if (ext) {
        emails.push(ext)
        continue
      }
      unknown.push(id)
    }
    return { emails, unknown }
  }

  expandIdsInText(text: string): string {
    if (!text) return text
    // Longer ids first so usr_employee is not partially shadowed by a shorter prefix id.
    const pairs: Array<{ id: string; login: string }> = []
    for (const e of this.dir.entries) {
      pairs.push({ id: e.id, login: e.email })
    }
    for (const [token, email] of this.extToEmail) {
      pairs.push({ id: token, login: email })
    }
    if (this.selfEmail) {
      pairs.push({ id: SELF_ID, login: this.selfEmail })
    }
    pairs.sort((a, b) => b.id.length - a.id.length)

    let out = text
    for (const { id, login } of pairs) {
      // Word-ish boundary: id must not be glued to [A-Za-z0-9_].
      const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(id)}(?![A-Za-z0-9_])`, "g")
      out = out.replace(re, login)
    }
    return out
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Pass-through obfuscator for when MAIL_OBFUSCATION is disabled. */
class PassthroughObfuscator implements Obfuscator {
  readonly enabled = false
  registerSelf(): void {}
  resolveRecipients(ids: string[]): { emails: string[]; unknown: string[] } {
    return { emails: ids, unknown: [] }
  }
  expandIdsInText(text: string): string {
    return text
  }
  maskAddress(addr: string): string {
    return addr
  }
  maskAddresses(addrs: string[]): string[] {
    return addrs
  }
  maskListItems<T extends { from: string[]; to: string[] }>(items: T[]): T[] {
    return items
  }
  maskMessage<T extends { from: string[]; to: string[]; cc: string[] }>(msg: T): T {
    return msg
  }
  maskSendResult<T extends { accepted: string[]; rejected: string[] }>(r: T): T {
    return r
  }
}

export function createObfuscator(dir: RecipientDirectory): Obfuscator {
  return new DirectoryObfuscator(dir)
}

export function createPassthroughObfuscator(): Obfuscator {
  return new PassthroughObfuscator()
}

/** Reads MAIL_OBFUSCATION from env. Default ON (fail-closed toward privacy). */
export function isObfuscationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MAIL_OBFUSCATION ?? "true").trim().toLowerCase()
  return !(v === "0" || v === "false" || v === "no" || v === "off")
}
