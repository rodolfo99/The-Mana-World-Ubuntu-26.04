#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="$ROOT/instalado"
MANA_BIN="${MANA_BIN:-$PREFIX/bin/mana}"
if [[ ! -x "$MANA_BIN" ]]; then
  echo "No se encontró un cliente Mana ejecutable: $MANA_BIN" >&2
  echo "La instalación se guarda dentro de cada copia del proyecto. Revisa si lo instalaste en otra carpeta:" >&2
  echo "  find \"$HOME/Descargas\" -type f -path '*/instalado/bin/mana' -executable -print" >&2
  echo "Si no aparece, ejecuta ./scripts/instalar-cliente.sh para compilar solo el cliente." >&2
  echo "Si aparece en otra copia, ejecuta MANA_BIN='/ruta/instalado/bin/mana' ./scripts/cliente.sh" >&2
  exit 1
fi
MANA_PREFIX="$(cd "$(dirname "$MANA_BIN")/.." && pwd)"
export LD_LIBRARY_PATH="$MANA_PREFIX/lib:$MANA_PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$MANA_BIN" --server 127.0.0.1 --port 6901 \
  -d "$ROOT/sources/serverdata/client-data" "$@"
