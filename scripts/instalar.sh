#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/sources/tmwa"
DATA="$ROOT/sources/serverdata"
CLIENT="$ROOT/sources/mana"
PREFIX="$ROOT/instalado"
if [[ "$(id -u)" -eq 0 ]]; then
  echo "Ejecuta este script con tu usuario habitual, sin sudo; solo apt usa sudo." >&2
  exit 1
fi

if [[ "$(uname -m)" != x86_64 ]]; then
  echo "Este paquete está preparado para Ubuntu x86_64." >&2; exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  echo "No se puede identificar Ubuntu." >&2; exit 1
fi
source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 26.04 ]]; then
  echo "Se requiere Ubuntu 26.04; sistema detectado: ${PRETTY_NAME:-desconocido}." >&2
  exit 1
fi
for path in "$SERVER/.git" "$DATA/client-data/maps" "$DATA/tools/tmx_converter.py" "$CLIENT/libs/guichan/CMakeLists.txt"; do
  [[ -e "$path" ]] || { echo "Falta una fuente o submódulo: $path" >&2; exit 1; }
done
if ! git -C "$SERVER" describe --tags >/dev/null 2>&1; then
  echo "TMWA requiere historial Git con etiquetas para determinar su versión." >&2; exit 1
fi
JOBS="${JOBS:-4}"
[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || { echo "JOBS debe ser entero positivo." >&2; exit 1; }

echo "Instalando dependencias de compilación (sudo)..."
sudo apt-get update
paquetes=(
  build-essential cmake git python3 pkg-config
  libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-net-dev
  libsdl2-ttf-dev libphysfs-dev libcurl4-openssl-dev libxml2-dev
  zlib1g-dev libgl-dev libpng-dev gettext
)
sudo apt-get install -y "${paquetes[@]}"

echo "Compilando TMWA..."
cmake -S "$SERVER" -B "$SERVER/build-local" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX"
cmake --build "$SERVER/build-local" -j "$JOBS"
cmake --install "$SERVER/build-local"

echo "Preparando los datos y mapas..."
make -C "$DATA" maps conf news
python3 "$ROOT/scripts/configurar-local.py" "$DATA"

echo "Compilando Mana (cliente SDL2)..."
cmake -S "$CLIENT" -B "$CLIENT/build-local" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" -DUSE_SYSTEM_GUICHAN=OFF \
  -DENABLE_MANASERV=OFF -DENABLE_NLS=ON
cmake --build "$CLIENT/build-local" -j "$JOBS"
cmake --install "$CLIENT/build-local"
[[ -x "$PREFIX/bin/mana" ]] || { echo "El cliente no se instaló en $PREFIX/bin/mana." >&2; exit 1; }

echo "Instalación finalizada. En dos terminales ejecuta:"
echo "  $ROOT/scripts/servidor.sh"
echo "  $ROOT/scripts/cliente.sh"
