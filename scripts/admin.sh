#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="$ROOT/instalado"
[[ -x "$PREFIX/bin/tmwa-admin" ]] || { echo "Ejecuta antes scripts/instalar.sh." >&2; exit 1; }
[[ -f "$ROOT/sources/serverdata/login/conf/ladmin_local.conf" ]] || {
  echo "Falta la configuración de la administración local." >&2; exit 1;
}
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$ROOT/sources/serverdata/login"
exec "$PREFIX/bin/tmwa-admin" "$@"
