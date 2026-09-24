#!/usr/bin/env python3
"""Ajustes de una instancia local; no borra cuentas ni cambia claves existentes."""
from pathlib import Path
import re
import secrets
import sys

if len(sys.argv) != 2:
    raise SystemExit("Uso: configurar-local.py DIRECTORIO_SERVERDATA")
root = Path(sys.argv[1]).resolve()
admin_config = root / "login/conf/ladmin_local.conf"
admin_current = admin_config.read_text(encoding="utf-8")
match = re.search(r"^\s*admin_pass\s*:\s*(\S+)\s*$", admin_current, re.M)
if not match:
    raise SystemExit(f"Falta admin_pass en {admin_config}")
admin_pass = match.group(1)
if admin_pass == "admin":
    # El paquete de autenticación administrativa usa un campo de 18 bytes.
    admin_pass = secrets.token_hex(8)
files = {
    "login/conf/login_local.conf": {
        "admin_state": "yes",
        "admin_pass": admin_pass,
        "update_host": '""',
        "main_server": "TMW local",
        "ladminallowip": "127.0.0.1",
    },
    "login/conf/ladmin_local.conf": {"admin_pass": admin_pass},
    "world/conf/char_local.conf": {"server_name": "TMW local"},
}
for relative, settings in files.items():
    file = root / relative
    content = file.read_text(encoding="utf-8")
    for key, value in settings.items():
        pattern = re.compile(rf"^(\s*{re.escape(key)}\s*:\s*).*$", re.M)
        updated, count = pattern.subn(lambda m: m.group(1) + value, content)
        if count != 1:
            raise SystemExit(f"Se esperaba una clave {key} en {file}: encontradas {count}")
        content = updated
    file.write_text(content, encoding="utf-8")
    if "admin_pass" in settings:
        file.chmod(0o600)
print("Configuración lista: administración habilitada solo para 127.0.0.1; "
      "clave compartida en login/conf/{login,ladmin}_local.conf (permisos 600).")
