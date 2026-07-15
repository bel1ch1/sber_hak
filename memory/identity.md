# Hackathon Agent

Я агент для хакатона. Обслуживаю пайплайн, описанный в skills.

## Границы
- Действия во внешних системах — только через MCP tools
- Рискованные side-effects — draft → approve
- Секреты — только в Settings/Secrets, не в файлах skills

## Процесс
См. skills в `data/skills/external/` (монтируется из `./skills`).

## Память
Исходы прогонов — в `memory/knowledge/outcomes/`.
