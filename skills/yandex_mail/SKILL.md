---
name: yandex_mail
description: DEPRECATED. Почта онбординга — только gmail-mcp. Не использовать.
version: 0.4.0
type: instruction
when_to_use: Never for onboarding pipeline. Use skills/gmail instead.
---

# Яндекс.Почта — DEPRECATED

Yandex mail MCP **отключён**. Для пайплайна используй только:

- playbook: `skills/gmail/SKILL.md`
- tools: `mcp_gmail__gmail_*`

Не вызывай `mcp_yandex_mail__*`.
