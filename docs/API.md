# API приложений SimplyOS

Актуально для App API 1.8 (включая текущие сборки Release и Dev). [Машинный контракт](api-contract.json) фиксирует методы и разрешения. Версия API отличается от номера обновления ОС и от `formatVersion` пакета. Приложение обращается к API через `window.simplyos.request(method, payload)`. Мост внедряется в HTML установленного приложения при открытии; его нельзя подключить обычным `<script>` с сайта.

## Создание пакета

VPK — ZIP-архив с расширением `.vpk`. В его корне должны находиться `manifest.json` и HTML-файл из поля `entry`; дополнительные JS, CSS и изображения кладутся внутрь архива. Пример структуры:

```text
manifest.json
index.html
app.js
icons/app.svg
```

Обязательные поля манифеста: `format: "vole-app"`, `formatVersion: 1`, `id`, `name`. Рекомендуется явно задавать `appVersion`, `entry` и `permissions`; если они отсутствуют, используются соответственно `0.0.0`, `index.html` и пустой список. Необязательные поля: `developer`, `icon`, `networkHosts`. ID содержит строчные латинские буквы, цифры, точки и дефисы, от 3 до 80 символов. `permissions` содержит имена разрешений из контракта, а не имена всех вызываемых методов. В `networkHosts` перечисляются точные домены или узлы с портами для сетевого API, не более 20 записей. Лимиты архива: 50 МБ при загрузке, 200 МБ распакованных данных, 2 000 файлов. Произвольные установочные скрипты в VPK не выполняются.

```json
{
  "format": "vole-app",
  "formatVersion": 1,
  "id": "org.example.notes",
  "name": "Заметки",
  "developer": "Example Studio",
  "appVersion": "1.0.0",
  "entry": "index.html",
  "permissions": ["files.open", "files.save"]
}
```

Официальный Магазин проверяет подпись каталога и SHA-256 пакета. Эти проверки подтверждают происхождение и целостность пакета. Доверенный статус и заявленные разрешения выдаются отдельно. Для файла из неизвестного источника доверие можно назначить после 24 часов и действия пользователя.

Минимальный `index.html` для проверки подключения:

```html
<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<title>Заметки</title>
<button id="check">Проверить API</button>
<output id="result"></output>
<script>
document.querySelector('#check').onclick = async () => {
  const result = document.querySelector('#result');
  if (!window.simplyos) {
    result.textContent = 'Системный API недоступен: проверьте доверие приложения';
    return;
  }
  try {
    const info = await window.simplyos.request('system.api.info');
    result.textContent = `API ${info.apiVersion}; доступно методов: ${info.methods.length}`;
  } catch (error) {
    result.textContent = `${error.code || 'UNAVAILABLE'}: ${error.message}`;
  }
};
</script>
</html>
```

Соберите архив так, чтобы `manifest.json` и `index.html` находились непосредственно в его корне, и присвойте архиву расширение `.vpk`. Проверяйте нужные методы по `info.methods` при запуске: наличие кода приложения не означает, что на устройстве установлена подходящая версия API или пользователем выдано разрешение.

## Кому доступны методы

| Среда | Доступ |
| --- | --- |
| Встроенная оболочка SimplyOS | Внутренние HTTP API backend после входа пользователя; это отдельный интерфейс, не мост VPK. |
| Доверенное установленное VPK-приложение | Только методы, разрешения которых перечислены в `manifest.json` и не отозваны в настройках. `system.api.info` доступен без отдельного разрешения. |
| Недоверенное VPK-приложение | Мост `window.simplyos` отсутствует. Прямой доступ к внутренним HTTP API не является поддерживаемым способом интеграции. |
| Обычный веб-сайт в браузере | Системный API приложений не предоставляется. Сайт может использовать только стандартные возможности браузера и пользовательский выбор файлов. |

Официальная подпись магазина подтверждает происхождение пакета, но сама по себе не выдаёт доверие. При установке пользователь выбирает доверие; для стороннего пакета, установленного из файла, доверие можно выдать после 24 часов и отдельного действия пользователя. Отзыв разрешений применяется при следующем запросе. Окно приложения должно оставаться открытым. В свёрнутом окне работают только уведомления, ограниченные сетевые запросы и завершение уже начатого медиа-сеанса; остальные запросы отклоняются. API не предоставляет терминал, произвольные команды, root-доступ или прямой путь к домашнему каталогу.

## Методы и разрешения

| Метод | Разрешение в `manifest.json` | Назначение |
| --- | --- | --- |
| `system.api.info` | Не требуется | Версия API, разрешённые методы и действующие разрешения. |
| `system.status.read` | `system.status.read` | Краткое состояние системы. |
| `system.hardware.read` | `system.hardware.read` | Модель ЦП и графического адаптера, объём ОЗУ в ГиБ без имени компьютера и серийных номеров. |
| `system.locale.read` | `system.locale.read` | Раскладка и язык ввода. |
| `files.open` | `files.open` | Выбор файла пользователем; возвращает имя, MIME и `ArrayBuffer` до 64 МБ. |
| `files.save` | `files.save` | Диалог выбора места и сохранение текста или офисного файла. |
| `app.data.read` | `app.data.read` | Личные данные приложения в его хранилище. |
| `app.data.write` | `app.data.write` | Запись личных данных приложения. |
| `clipboard.text.read` | `clipboard.read` | Чтение текста буфера обмена. |
| `clipboard.text.write` | `clipboard.write` | Запись текста в буфер обмена. |
| `notifications.post` | `notifications.post` | Сообщение в центре уведомлений. Работает при свёрнутом окне, до 10 в минуту. |
| `network.http.request` | `network.http` | HTTPS к узлу, указанному в `networkHosts`. |
| `network.http.private.request` | `network.http.private` | HTTPS к указанному серверу локальной сети. |
| `media.capture.open/answer/close` | `media.capture` | Локальный медиа-сеанс с системным подтверждением. Используйте обёртку `getUserMedia`. |
| `devices.bluetooth.list` | `devices.bluetooth.read` | Обнаруженные Bluetooth-устройства. |
| `devices.bluetooth.connect/disconnect` | `devices.bluetooth.control` | Подключение или отключение сопряжённого устройства с системным подтверждением. |
| `devices.usb.list` | `devices.usb.read` | Список подключённых USB-устройств без доступа к их данным. |
| `printing.printers.list` | `printing.read` | Доступные принтеры. |
| `printing.jobs.list` | `printing.read` | Очередь печати текущего пользователя. |
| `printing.submit` | `printing.submit` | Окно печати для PDF, PNG, JPEG или текста, до 16 МБ. |
| `printing.jobs.cancel` | `printing.manage` | Отмена собственного задания печати. |
| `vpn.status` | `network.vpn.read` | Состояние локальной VPN-службы. |
| `vpn.probe` | `network.vpn.read` | Доступность сервера и задержка TCP в мс. |
| `vpn.subscription.fetch` | `network.vpn.read` | Загрузка подписки по HTTPS. |
| `vpn.connect` | `network.vpn.control` | Подключение профиля после ввода пароля Linux. |
| `vpn.disconnect` | `network.vpn.control` | Отключение после ввода пароля Linux. |
| `mesh.devices.list` | `mesh.read` | Подключённые USB/COM-порты и обнаруженные Bluetooth-устройства. |
| `mesh.status` | `mesh.read` | Состояние подключения Meshtastic или MeshCore. |
| `mesh.nodes` | `mesh.read` | Узлы Meshtastic или контакты MeshCore. |
| `mesh.messages` | `mesh.read` | Сообщения текущего сеанса. |
| `mesh.connect` | `mesh.control` | Подключение к локальному устройству по USB/COM, Bluetooth или IP с подтверждением. |
| `mesh.disconnect` | `mesh.control` | Отключение от устройства. |
| `mesh.send` | `mesh.control` | Отправка текста узлу, контакту или в канал. |
| `mesh.configure` | `mesh.control` | Изменение имени, мощности и настроек радиомодуля с подтверждением. |

Разрешения должны быть объявлены заранее. Установка пакета с неизвестным разрешением отклоняется. Пользователь видит заявленные и отозванные разрешения в настройках приложения.

## Радиоустройства Meshtastic и MeshCore

API 1.8 предоставляет высокоуровневые операции без произвольного доступа приложения к последовательному порту или Bluetooth-сокету. Для чтения нужны `mesh.read`, для подключения, отправки и записи настроек — `mesh.control`. Подключаться можно к перечисленному USB/COM-порту, Bluetooth-адресу устройства или к IP-адресу в частной локальной сети. Для IP используются TCP 4403 у Meshtastic и TCP 4000 у MeshCore. Подключение и запись настроек требуют подтверждения пользователя в SimplyOS. Устройство должно быть доступно пользователю оболочки; при установке обновления он добавляется в группу `dialout`.

```json
{
  "id": "ru.example.radio",
  "permissions": ["mesh.read", "mesh.control", "notifications.post"]
}
```

```js
const radio = window.simplyos;
const available = await radio.request('mesh.devices.list');
const port = available.serial[0]?.path;
if (port) {
  await radio.request('mesh.connect', {
    protocol: 'meshtastic', transport: 'usb', address: port
  });
  const {nodes} = await radio.request('mesh.nodes');
  const {messages, lastSeq} = await radio.request('mesh.messages', {after: 0});
  console.log(nodes.length, messages.length, lastSeq);
  // Отправлять сообщение следует только после явного действия пользователя:
  // await radio.request('mesh.send', {text: 'Привет', target: '', channel: 0});
  await radio.request('mesh.disconnect');
}
```

`mesh.status` возвращает `{connected, protocol, transport, address, lastSeq}`; при отсутствии устройства — `{connected: false}`. `mesh.messages` принимает `after` и отдаёт новые события текущего сеанса (не более 100 за запрос). Приложение может сохранять историю в `app.data`. Для Meshtastic личный адрес имеет вид `!a1b2c3d4`, пустой `target` обозначает канал. Для MeshCore личный адрес — публичный ключ контакта из `mesh.nodes`. `mesh.configure` принимает заполненные поля `name`, `shortName`, `txPower`, `region`, `preset`; последние три настройки частично зависят от протокола. При свёрнутом окне можно опрашивать только `mesh.status` и `mesh.messages`, чтобы показать системное уведомление о новом сообщении.

## Сведения об оборудовании

Метод `system.hardware.read` доступен доверенному VPK, если в манифесте указано разрешение `system.hardware.read`. Он возвращает объект `{cpuModel, graphicsModel, ramGiB}`: строковое название процессора, строковое название графического адаптера и целое число гигабайт оперативной памяти. Если `lspci` недоступен, название графического адаптера определяется по локальному каталогу PCI ID; числовые идентификаторы показываются только для устройства, которого нет в каталоге. Если оборудование определить не удалось, возвращается «Не определён» или `0` для памяти. Имя компьютера, имя пользователя, серийные номера и MAC-адреса в ответ не входят.

```js
const hardware = await window.simplyos.request('system.hardware.read');
console.log(hardware.cpuModel, hardware.graphicsModel, hardware.ramGiB);
```

Получение сведений локально не означает согласия на их передачу. Перед отправкой результатов во внешний сервис приложение должно показать точный состав данных и получить отдельное согласие пользователя. Разрешение можно отозвать в настройках SimplyOS.

## Уведомления и работа в свёрнутом окне

Приложение остаётся запущенным после сворачивания. Для почты и мессенджера можно периодически вызывать `network.http.request` и при появлении события отправлять `notifications.post`. В свёрнутом окне также доступен `vpn.status`, чтобы VPN-клиент мог отслеживать состояние соединения. Chromium может замедлять фоновые таймеры, поэтому интервал доставки не гарантирован; закрытое приложение не выполняет код. Нажатие на уведомление раскрывает окно. После выхода из учётной записи фоновая работа прекращается.

```js
async function checkInbox() {
  const response = await window.simplyos.request('network.http.request', {
    url: 'https://mail.example.org/api/unread', method: 'GET',
    headers: {Authorization: 'Bearer ' + accessToken}
  });
  if (response.status === 200) {
    const inbox = JSON.parse(response.body);
    if (inbox.newCount) await window.simplyos.request('notifications.post', {
      title: 'Новая почта', message: `Новых сообщений: ${inbox.newCount}`
    });
  }
}
setInterval(checkInbox, 30000);
```

Для такого приложения в манифесте нужны `"permissions":["network.http","notifications.post"]` и `"networkHosts":["mail.example.org"]`. Сетевой посредник не передаёт cookies пользователя, не следует перенаправлениям, ограничивает ответ 1 МБ и принимает только перечисленные узлы. Текущий мост принимает адреса HTTPS, в том числе для `network.http.private.request` к серверу локальной сети с отдельным разрешением; адреса localhost, link-local и служебных сетей закрыты. Это контролируемый обход CORS для доверенного приложения, а не отключение CORS в Chromium. Сетевые запросы ограничены 60 в минуту на приложение.

## Камера и микрофон

Для доверенного VPK с разрешением `media.capture` вызовите `window.simplyos.getUserMedia({video:true,audio:true})`. SimplyOS покажет своё окно подтверждения. Поток передаётся из оболочки в изолированное приложение через локальный WebRTC-канал и работает, пока окно свёрнуто. После завершения вызова освободите устройства:

```js
const stream = await window.simplyos.getUserMedia({video:true,audio:true});
video.srcObject = stream;
// После звонка:
await window.simplyos.releaseMedia(stream);
```

Вызов `getUserMedia` запрашивает новый доступ каждый раз. Индикатор камеры и микрофона в центре уведомлений показывает активный захват. При закрытии окна SimplyOS останавливает поток. Обычные сайты и PWA в браузере используют веб-метод `navigator.mediaDevices.getUserMedia` и существующее системное подтверждение сайта.

## Bluetooth и USB

`devices.bluetooth.list` возвращает обнаруженные устройства. `connect` и `disconnect` принимают `{address:'AA:BB:CC:DD:EE:FF'}`; устройство сначала нужно сопрячь в настройках SimplyOS. Система запрашивает подтверждение и пароль Linux сама, приложение пароль не получает. `devices.usb.list` возвращает имя, идентификаторы производителя и продукта подключённых устройств. Сканер в режиме USB HID «клавиатура» передаёт штрихкод как обычный ввод в поле приложения. Прямой обмен с произвольными USB-устройствами этим API не предоставляется; для него потребуется отдельный протокол и модель доступа к конкретному классу устройств.

## Примеры

```json
{
  "format": "vole-app",
  "formatVersion": 1,
  "id": "org.example.notes",
  "name": "Заметки",
  "appVersion": "1.0.0",
  "entry": "index.html",
  "permissions": ["app.data.read", "app.data.write", "files.open", "files.save"]
}
```

```js
async function loadNotes() {
  const info = await window.simplyos.request('system.api.info');
  if (!info.methods.includes('app.data.read')) throw new Error('Доступ к данным отозван');
  const saved = await window.simplyos.request('app.data.read');
  return JSON.parse(saved.content || '{}');
}

async function storeNotes(notes) {
  await window.simplyos.request('app.data.write', JSON.stringify(notes));
}
```

```js
const selected = await window.simplyos.request('files.open', {extensions: ['.txt']});
if (!selected.cancelled) {
  const content = new TextDecoder().decode(selected.buffer);
  const saved = await window.simplyos.request('files.save', {
    name: 'Заметка.txt', content
  });
  if (!saved.cancelled) console.log(saved.path);
}
```

```js
try {
  const status = await window.simplyos.request('vpn.status');
  console.log(status.active);
} catch (error) {
  console.error(error.code, error.message);
}
```

Для двоичного `files.save` передавайте `{name:'Файл.docx', encoding:'base64', content:'...'}`. Для `printing.submit` передавайте `{name, mime, data}` с `Blob`, `ArrayBuffer` или `Uint8Array`. Пароль для `vpn.connect` и `vpn.disconnect` запрашивайте при каждом действии и не сохраняйте в `app.data`.

Отклонённый запрос возвращает исключение с полями `code` и `message`. Основные коды: `PERMISSION_DENIED`, `INVALID_REQUEST`, `METHOD_NOT_FOUND`, `FILE_TOO_LARGE`, `CONFLICT`, `UNAVAILABLE`, `TIMEOUT`. Проверяйте `code`; текст `message` предназначен для пользователя и может меняться.
