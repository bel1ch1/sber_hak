---
name: yandex_wiki
description: Чтение страниц Яндекс.Вики (wiki.yandex.ru) через read-only MCP
version: 0.2.0
type: instruction
when_to_use: User asks to read or browse pages in Yandex Wiki / wiki.yandex.ru / corporate wiki.
---

# Яндекс.Вики (read-only MCP)

## Роль
Помогаю **читать** страницы wiki.yandex.ru. Запись в вики через этот MCP **недоступна**.

## Tools
| Шаг | Tool | autonomy |
|-----|------|----------|
| Прочитать страницу | `mcp_yandex_wiki__yandex_wiki_get_page` | auto |
| Обойти раздел | `mcp_yandex_wiki__yandex_wiki_list_descendants` | auto |

## Навигация (нет full-text search)
API не умеет искать по тексту. Алгоритм:
1. Знаешь slug из URL wiki.yandex.ru → `get_page`
2. Ищешь в разделе → `list_descendants` от родительского slug
3. Не знаешь структуру → спроси у пользователя корневой slug

## Входной контракт
- required: `slug` или `page_id`

## Запреты
- Не выдумывать slug/page_id
- Не обещать полнотекстовый поиск
- Не пытаться создавать/редактировать страницы (write-tools отсутствуют)
- При недоступном MCP — сообщить явно
