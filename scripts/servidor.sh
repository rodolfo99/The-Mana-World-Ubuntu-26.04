#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="$ROOT/instalado"
DATA="$ROOT/sources/serverdata"
for bin in tmwa-login tmwa-char tmwa-map; do
  [[ -x "$PREFIX/bin/$bin" ]] || { echo "Ejecuta antes scripts/instalar.sh ($bin)." >&2; exit 1; }
done
[[ -f "$DATA/login/conf/login_local.conf" ]] || { echo "Faltan los datos configurados." >&2; exit 1; }
"$ROOT/scripts/preparar-traduccion.sh" --npc
export PATH="$PREFIX/bin:$PATH"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$DATA"
exec ./run-all
