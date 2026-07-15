# Ouroboros: MCP только в task, не в ephemeral-чате

## Симптом
Агент пишет: `[CAPABILITY_OMISSION_MANIFEST] mcp: ephemeral_turn` — MCP tools недоступны.

## Причина
Ouroboros намеренно исключает MCP из **ephemeral/decision turn** (быстрый ответ в чате), потому что MCP tools могут иметь side-effects (календарь, вики).

## Решение
Запускать работу с календарём/вики как **task**, не как обычное сообщение в чате:
- Промотировать чат в задачу (promote to task)
- Или явно: «запусти как задачу: покажи календарь на завтра»

В task MCP tools (`mcp_yandex_calendar__*`) появляются в capability envelope.

## Проверка инфраструктуры
MCP сервер может быть здоров, settings.json с `MCP_ENABLED=true` — но в ephemeral-ходе tools всё равно не выдаются. Это не баг деплоя.
