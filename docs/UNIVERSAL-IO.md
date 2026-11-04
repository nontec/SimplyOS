# Универсальные устройства и сеть — App API 1.15

Доступно с SimplyOS 26.11-Dev.6. Протоколы конкретного оборудования реализуются внутри приложения. ОС отвечает за выбор цели, согласие пользователя, изоляцию каналов и передачу байтов. Mesh Радио 2.0 служит примером клиента COM, BLE и TCP; его исходники опубликованы в `apps/mesh-radio` публичного репозитория SimplyOS.

## Разрешения и принуждение

Низкоуровневые каналы доступны доверенным приложениям с явно выданными разрешениями. Наличие подписи Магазина само по себе не заменяет согласия на устройство. Недоверенный VPK не получает доступ к каналам.

Вызов идёт через `window.simplyos.request(method, payload)`. Мост связывает запрос с действующим окном и установленным приложением, проверяет манифест и отозванные разрешения. Сервер повторно проверяет происхождение запроса, текущего пользователя и права приложения. ID приложения в payload не меняет владельца канала. Объекты каналов принадлежат паре пользователь–приложение; другое приложение не может читать их или закрывать.

Открытие канала требует отдельного системного подтверждения конкретного устройства или сетевого узла. Внутренние билеты подтверждения одноразовые и действуют 60 секунд; метод подтверждения не экспортируется приложению. Полученный `handle` используется во всех последующих операциях. Нельзя передать путь произвольного файла вместо COM-порта. GATT ограничивается согласованными UUID сервисов. USB ограничивается vendor-specific интерфейсами; драйверы ядра не отсоединяются, диски и клавиатуры не передаются приложению.

Закрытие, удаление приложения, отзыв разрешений или 120 секунд без обращения к каналу прекращают доступ. Действующие операции ввода-вывода разрешены в свёрнутом окне и при блокировке рабочего стола; новый запрос доступа требует активного окна. Это не автономная фоновая служба: при уничтожении окна его JS прекращается, оставшиеся ресурсы освобождаются по тайм-ауту. Для постоянной службы используется отдельный API фоновой работы.

До 8 каналов на приложение и 64 на пользователя. Бинарные данные передаются в base64, до 65 536 байт за операцию (UDP — до 65 507). У операций ограничены время ожидания и очереди; пустое чтение не означает разрыв. Проверяйте `connected`, `io.status` и события.

| Методы | Разрешение |
| --- | --- |
| `devices.serial.list` | `devices.serial.read` |
| `devices.serial.open/read/write/signals/close` | `devices.serial.control` |
| `devices.bluetooth.scan` | `devices.bluetooth.read` |
| `devices.bluetooth.gatt.open/services/read/write/subscribe/unsubscribe/events/close` | `devices.bluetooth.gatt` |
| `devices.usb.enumerate` | `devices.usb.read` |
| `devices.usb.open/claim/release/transferIn/transferOut/controlTransfer/close` | `devices.usb.control` |
| `network.tcp.open/read/write/close` | `network.tcp` |
| `network.udp.open/send/receive/close` | `network.udp` |
| `network.websocket.open/send/receive/close` | `network.websocket` |
| `network.local.info` | `network.local` |
| `io.status/events/close` | `io.read` |

Названия после `/` обозначают отдельные методы с общим префиксом. Например, `network.tcp.read`.

## COM / USB serial

```js
const api = window.simplyos;
const {devices} = await api.request('devices.serial.list', {});
const {handle} = await api.request('devices.serial.open', {
  deviceId: devices[0].id, baudRate: 115200,
  dataBits: 8, parity: 'N', stopBits: 1, flowControl: 'none', dtr: false, rts: false
});
try {
  await api.request('devices.serial.write', {handle, data: btoa('hello\n')});
  const answer = await api.request('devices.serial.read', {handle, maxBytes: 4096});
  const bytes = Uint8Array.from(atob(answer.data), ch => ch.charCodeAt(0));
  console.log(bytes, answer.connected);
} finally { await api.request('devices.serial.close', {handle}); }
```

Список содержит подключённые порты, доступные пользователю. Скорость 300–4 000 000, биты 5–8, parity `N/E/O/M/S`, stopBits `1/1.5/2`, flowControl `none/rtscts/xonxoff`. `signals` принимает `handle`, `dtr` и/или `rts`. Если устройство требует Linux-права на порт, они должны быть настроены системой; приложение не получает root-доступ.

## Bluetooth LE

```js
const {devices} = await api.request('devices.bluetooth.scan', {services: ['180f']});
const {handle} = await api.request('devices.bluetooth.gatt.open', {
  address: devices[0].address, services: ['180f']
});
const services = await api.request('devices.bluetooth.gatt.services', {handle});
const value = await api.request('devices.bluetooth.gatt.read', {handle, characteristic: '2a19'});
await api.request('devices.bluetooth.gatt.subscribe', {handle, characteristic: '2a19'});
const events = await api.request('devices.bluetooth.gatt.events', {handle});
await api.request('devices.bluetooth.gatt.close', {handle});
```

UUID допускает 16-битную или полную форму. `write` принимает `characteristic`, `data` в base64 и `response` (boolean); до 512 байт. Согласуйте режим записи с `properties` характеристики. Уведомления читаются через `events`, очередь до 128 событий. `unsubscribe` отменяет подписку. Поиск — до шести раз в минуту на приложение. Сопряжение и PIN выполняются в настройках Bluetooth ОС. Аудиоустройства обслуживаются системным Bluetooth/audio-стеком, а не GATT.

## Raw USB

`enumerate` возвращает `devices`: ID, VID/PID, имя, vendor-specific интерфейсы и их endpoints. `open({deviceId})` возвращает handle после согласия, `claim({handle,interface})` захватывает допустимый интерфейс. `transferIn({handle,endpoint,length})` читает bulk/interrupt endpoint; `transferOut({handle,endpoint,data})` пишет. `controlTransfer` принимает `requestType`, `request`, `value`, `index`, `data`/`length`; допускаются только vendor-запросы, интерфейсные запросы требуют claim. `release({handle,interface})` освобождает интерфейс. `close({handle})` освобождает все claims. Нужны установленные Linux/udev-права на конкретное устройство; API не обходит их и не выдаёт доступ ко всем USB.

## TCP, UDP, WebSocket и Wi-Fi

```js
const {handle} = await api.request('network.tcp.open', {
  host: '192.168.1.25', port: 4403, tls: false
});
await api.request('network.tcp.write', {handle, data: 'AQID'});
const reply = await api.request('network.tcp.read', {handle, maxBytes: 4096});
const state = await api.request('io.status', {handle});
await api.request('io.close', {handle});
```

TCP и UDP закреплены за одним подтверждённым host/port. UDP `send`/`receive` не разрешают смену получателя; при обрезке датаграммы `receive` возвращает `truncated`. WebSocket `open` дополнительно принимает `path`, `tls` (по умолчанию true), `subprotocols` и `headers`. Допустимы заголовки Authorization, Accept и X-*, без CR/LF; Authorization требует WSS. `send` принимает base64 `data` или `text`, `receive` возвращает соответствующее поле. TLS проверяет сертификат и имя сервера; отключения проверки сертификатов нет.

Для частных адресов дополнительно требуется `network.local`. Loopback, link-local, multicast, broadcast, unspecified и зарезервированные адреса запрещены. DNS выполняется после согласия, проверяются все ответы; соединение закреплено за проверенным IP. Если манифест содержит `networkHosts`, разрешены только указанные точные имена или `host:port`. HTTPS-прокси с контролем CORS — отдельные `network.http.request` и `network.http.private.request`; HTTP-разрешение само по себе не открывает сокеты.

`network.local.info` возвращает сведения о сети из системного статуса, без паролей. Wi-Fi — транспорт IP для этих методов; сканирование и управление подключениями остаются в существующих системных сетевых API. Перехват Wi-Fi кадров и monitor mode не предоставляются.

`io.status({handle})` возвращает состояние собственного канала. `io.events({handle})` возвращает события `connected`/`disconnected`; это отдельная очередь жизненного цикла, не очередь GATT-данных. Состояние закрытого канала доступно владельцу ещё 60 секунд (до 128 последних каналов).

## SDK

SDK 0.2 включает `transports.js` и типы `transports.d.ts`. Они копируются в проекты шаблонов и предоставляют `openSerial`, `openGatt`, `openTcp`, `openUdp`, `openWebSocket`, объект Channel с `read/write/status/events/close` и GATT-методами. Обёртка кодирует Uint8Array, а не строки Unicode, в base64. Она вызывает те же системные проверки и не получает дополнительных прав.

## Совместимость и проверка

Старые `mesh.*` помечены `deprecated` и пока сохранены для уже установленных версий. Новые приложения должны использовать универсальные транспорты. Тесты проверяют COM на PTY, TCP/UDP/WebSocket на Linux, ограничения владельца, разрешения, DNS и размер данных; Bluetooth-поведение и протоколы Mesh проверены на имитаторах. Это не подтверждение совместимости каждой аппаратной модели или прошивки.
