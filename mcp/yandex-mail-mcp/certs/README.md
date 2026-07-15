# Корпоративный CA для Node.js

На машинах с Kaspersky / SSL-инспекцией Node не доверяет подменённому сертификату
(`self-signed certificate in certificate chain`). Нужен файл `corp-ca.pem`.

## Что уже лежит здесь

- `corp-ca.pem` — корневой CA Kaspersky Endpoint Security (MITM)
- `corp-proxy-chain.pem` — полная цепочка (для отладки)

Файлы `*.pem` в git не коммитятся.

## Как пересоздать (GUI, без скриптов)

1. Откройте в Edge/Chrome: `https://caldav.yandex.ru`
2. Замок → сертификат → путь сертификации
3. Выберите корневой CA (часто *Kaspersky … Certification Authority*)
4. Просмотр → Состав → Копировать в файл → **Base-64 X.509 (.CER)**
5. Сохраните как `certs/corp-ca.pem`

Либо: `certmgr.msc` → Доверенные корневые центры → экспорт того же CA в Base64.

## Запуск

npm-скрипты идут через `with-ca.cmd` и сами выставляют `NODE_EXTRA_CA_CERTS`,
если файл есть. Вручную:

```powershell
$env:NODE_EXTRA_CA_CERTS = "$PWD\certs\corp-ca.pem"
npm run smoke:discovery
```
