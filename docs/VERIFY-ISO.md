# Проверка установочного образа SimplyOS

Скачайте ISO, одноимённые файлы `.iso.sha256` и `.iso.sha256.sig`. Открытый ключ выпуска находится в [iso-signing-public.pem](iso-signing-public.pem) этого репозитория. Отпечаток SHA-256 его DER-представления:

`91bff67a05a9dfcd6857e6a6fb693fb5f8796f4e4b39ccde5b5c67bfb767b2e5`

В каталоге со скачанными файлами выполните (пример для Release.20):

```sh
openssl dgst -sha256 -verify iso-signing-public.pem -signature SimplyOS-26.10-Release.20-amd64.iso.sha256.sig SimplyOS-26.10-Release.20-amd64.iso.sha256
sha256sum -c SimplyOS-26.10-Release.20-amd64.iso.sha256
```

Первая команда должна вывести `Verified OK`, вторая — `OK`. При другой версии замените имя файла в обеих командах. Получайте открытый ключ отдельно от ISO и файлов контрольной суммы; например, из этого репозитория. Закрытый ключ ISO отличается от ключа каталога обновлений SimplyOS.
