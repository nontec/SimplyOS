"""Offline, per-session KeePassXC adapter for the signed Store app."""
import json
import os
import pwd
import subprocess
import tempfile
import threading
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr

from voleos.auth import _same_origin
from voleos.integrations import APP_ROOT, _home_path, _revoked_app_permissions
from voleos.sessions import session_user

router = APIRouter()
APP_ID = 'ru.simplyos.vault'
CLI = '/usr/bin/keepassxc-cli'
MAX_DATABASE = 32 * 1024**2
guard = threading.RLock()
unlocked = {}


class Operation(BaseModel):
    action: str
    path: str = Field(default='',max_length=4096)
    password: SecretStr | None = None
    entry: str = Field(default='',max_length=36)
    field: str = ''
    title: str = Field(default='',max_length=120)
    username: str = Field(default='',max_length=256)


def lock_vault(token):
    with guard:
        item = unlocked.pop(token, None)
        if item:
            item['timer'].cancel()
            item['password'][:] = bytes(len(item['password']))


def _authorize(request):
    token = request.cookies.get('voleos_session')
    user = session_user(token)
    if not user or user != pwd.getpwuid(os.getuid()).pw_name or not _same_origin(request):
        raise HTTPException(403, 'Требуется активный сеанс SimplyOS')
    try:
        root = APP_ROOT / APP_ID
        info = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
        if (root.is_symlink() or info.get('id') != APP_ID or info.get('installSource') != 'official'
                or info.get('trust') != 'trusted' or 'vault.local' not in info.get('permissions', [])
                or 'vault.local' in _revoked_app_permissions(APP_ID)):
            raise ValueError()
    except (OSError, ValueError):
        lock_vault(token)
        raise HTTPException(403, 'Менеджеру паролей требуется разрешение хранилища') from None
    return token


def _run(arguments, *secrets):
    if not Path(CLI).is_file():
        raise HTTPException(503, 'Компонент KeePassXC недоступен')
    try:
        result = subprocess.run([CLI, *arguments],input=b'\n'.join(bytes(value) for value in secrets)+b'\n',
                                capture_output=True, timeout=30, cwd='/',
                                env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','QT_QPA_PLATFORM':'offscreen'})
    except (OSError, subprocess.TimeoutExpired):
        raise HTTPException(503, 'KeePassXC не ответил') from None
    if result.returncode:
        raise HTTPException(400, 'KeePassXC не выполнил операцию. Проверьте мастер-пароль, формат и права доступа.')
    if len(result.stdout) > MAX_DATABASE:
        raise HTTPException(413, 'Ответ хранилища слишком велик')
    return result.stdout


def _entries(path, password):
    if not path.is_file() or path.stat().st_size > MAX_DATABASE:
        raise HTTPException(400, 'Выберите обычный файл KDBX размером до 32 МиБ')
    output = _run(['export','--quiet','--',str(path)],password)
    try:
        if b'<!DOCTYPE' in output or b'<!ENTITY' in output:
            raise ValueError()
        root = ET.fromstring(output)
        group = root.find('./Root/Group')
        if group is None:
            raise ValueError()
    except (ValueError, ET.ParseError):
        raise HTTPException(400, 'Не удалось прочитать записи хранилища') from None
    meta = root.find('./Meta')
    trash = meta.findtext('RecycleBinUUID') if meta is not None else None
    def walk(current, prefix='', depth=0):
        if depth > 48:
            raise HTTPException(400, 'Слишком глубокая структура групп')
        for entry in current.findall('Entry'):
            fields = {node.findtext('Key'):node.findtext('Value') or '' for node in entry.findall('String')}
            identity = entry.findtext('UUID')
            if identity and len(identity)<=36:
                yield identity,prefix+(fields.get('Title') or 'Без названия'),fields
        for child in current.findall('Group'):
            if not trash or child.findtext('UUID') != trash:
                yield from walk(child,prefix+(child.findtext('Name') or 'Группа')+' / ',depth+1)
    return walk(group)


def _public(item):
    return {'locked':False,'name':item['path'].name,'entries':item['entries']}


def _read_index(item):
    item['entries'] = [{'id':identity,'name':name} for identity,name,_ in _entries(item['path'],item['password'])]


def _touch(token, item):
    previous = item.get('timer')
    if previous:
        previous.cancel()
    def expire():
        with guard:
            if unlocked.get(token) is item and item['timer'] is timer:
                lock_vault(token)
    timer = threading.Timer(180, expire)
    timer.daemon = True
    item['timer'] = timer
    timer.start()


def _secret(value):
    secret = value.get_secret_value() if value else ''
    if len(secret)>4096 or any(character in secret for character in '\r\n\0'):
        raise HTTPException(400, 'Пароль должен быть в одну строку')
    return bytearray(secret,'utf-8')


@router.post('/api/system/vault')
def operate(body: Operation, request: Request):
    token = _authorize(request)
    with guard:
        item = unlocked.get(token)
        if body.action == 'lock':
            lock_vault(token)
            return {'locked':True}
        if body.action == 'status':
            return _public(item) if item else {'locked':True}
        if body.action in ('open','create'):
            lock_vault(token)
            path = _home_path(body.path)
            if path.suffix.lower() != '.kdbx':
                raise HTTPException(400, 'Выберите локальный файл KDBX')
            password = _secret(body.password)
            try:
                if body.action == 'create':
                    if len(password)<8:
                        raise HTTPException(400, 'Для нового хранилища требуется мастер-пароль от 8 байт')
                    if path.exists() or not path.parent.is_dir():
                        raise HTTPException(409, 'Выберите существующую папку и свободное имя файла')
                    with tempfile.TemporaryDirectory(dir=path.parent,prefix='.simplyos-vault-') as directory:
                        temporary = Path(directory)/'new.kdbx'
                        _run(['db-create','--quiet','--set-password','--',str(temporary)],password,password)
                        temporary.chmod(0o600)
                        item = {'path':temporary,'password':password}
                        _read_index(item)
                        os.link(temporary,path)
                        item['path'] = path
                else:
                    item = {'path':path,'password':password}
                    _read_index(item)
                if not session_user(token):
                    raise HTTPException(403, 'Сеанс SimplyOS закрыт')
                unlocked[token] = item
                _touch(token,item)
                return _public(item)
            except OSError:
                password[:] = bytes(len(password))
                raise HTTPException(409, 'Не удалось открыть или сохранить файл KDBX') from None
            except Exception:
                password[:] = bytes(len(password))
                raise
        if not item:
            raise HTTPException(409, 'Хранилище заблокировано')
        path = _home_path(str(item['path']))
        if body.action == 'copy' and body.field in ('Username','Password'):
            for identity,_,fields in _entries(path,item['password']):
                if identity == body.entry:
                    if not session_user(token):
                        raise HTTPException(403, 'Сеанс SimplyOS закрыт')
                    _touch(token,item)
                    return JSONResponse({'value':fields.get(body.field,'')},headers={'Cache-Control':'no-store'})
            raise HTTPException(404, 'Запись больше не существует')
        if body.action == 'add':
            title = body.title.strip()
            if not title or '/' in title or any(ord(character)<32 for character in title+body.username):
                raise HTTPException(400, 'Укажите имя записи без косых черт и управляющих символов')
            password = _secret(body.password)
            try:
                _run(['add','--quiet','--username='+body.username,'--password-prompt','--',str(path),title],item['password'],password)
            finally:
                password[:] = bytes(len(password))
            _read_index(item)
            _touch(token,item)
            return _public(item)
        raise HTTPException(400, 'Неизвестная операция хранилища')
