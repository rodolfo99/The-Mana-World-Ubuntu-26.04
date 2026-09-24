#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/sources/serverdata"
DEST="$ROOT/respaldos"
mkdir -p "$DEST"
file="$DEST/tmw-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
[[ -f "$DATA/login/save/account.txt" ]] || { echo "No existe la base de cuentas." >&2; exit 1; }
echo "Detén el servidor antes de respaldar para copiar los archivos en un estado coherente."
paths=(login/save world/save)
[[ -d "$DATA/world/map/save" ]] && paths+=(world/map/save)
tar -C "$DATA" -czf "$file" "${paths[@]}"
echo "Respaldo: $file"
