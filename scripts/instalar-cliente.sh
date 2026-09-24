#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT="$ROOT/sources/mana"
PREFIX="$ROOT/instalado"
JOBS="${JOBS:-4}"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Ejecuta este script con tu usuario habitual, sin sudo." >&2
  exit 1
fi
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "JOBS debe ser entero positivo." >&2; exit 1; }
[[ -f "$CLIENT/CMakeLists.txt" && -f "$CLIENT/libs/guichan/CMakeLists.txt" ]] || {
  echo "Faltan fuentes del cliente o su submódulo Guichan en $CLIENT." >&2
  exit 1
}
command -v cmake >/dev/null || { echo "Falta cmake; ejecuta ./scripts/instalar.sh para instalar las dependencias." >&2; exit 1; }

"$ROOT/scripts/preparar-traduccion.sh" --cliente
echo "Compilando Mana en: $PREFIX/bin/mana"
cmake -S "$CLIENT" -B "$CLIENT/build-local" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" -DUSE_SYSTEM_GUICHAN=OFF \
  -DENABLE_MANASERV=OFF -DENABLE_NLS=ON
cmake --build "$CLIENT/build-local" -j "$JOBS"
cmake --install "$CLIENT/build-local"
[[ -x "$PREFIX/bin/mana" ]] || { echo "No se generó $PREFIX/bin/mana." >&2; exit 1; }
echo "Cliente listo. Inícialo con: ./scripts/cliente.sh"
