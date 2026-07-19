---
name: yandex_calendar
description: DEPRECATED. Календарь онбординга — только google-calendar-mcp. Не использовать.
version: 0.4.0
type: instruction
when_to_use: Never for onboarding pipeline. Use skills/google_calendar instead.
---

# Яндекс.Календарь — DEPRECATED

Yandex calendar MCP **отключён**. Для пайплайна используй только:

- playbook: `skills/google_calendar/SKILL.md`
- tools: `mcp_google_calendar__google_calendar_*`

Не вызывай `mcp_yandex_calendar__*`.
