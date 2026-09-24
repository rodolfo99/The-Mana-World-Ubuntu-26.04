#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/sources/serverdata"
for bin in tmwa-login tmwa-char tmwa-map mana; do
  if [[ -x "$ROOT/instalado/bin/$bin" ]]; then echo "OK binario: $bin"
  else echo "PENDIENTE binario: $bin"; fi
done
for file in "$DATA/login/conf/login_local.conf" "$DATA/world/map/data/029-2.wlk" "$DATA/client-data/maps/029-2.tmx"; do
  if [[ -f "$file" ]]; then echo "OK datos: ${file#"$ROOT"/}"
  else echo "PENDIENTE datos: ${file#"$ROOT"/}"; fi
done
if command -v ss >/dev/null; then
  ss -ltn '( sport = :6901 or sport = :6122 or sport = :5122 )'
fi
