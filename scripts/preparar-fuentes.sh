#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

clone_pinned() {
  local dest="$1" url="$2" revision="$3"
  if [[ ! -e "$ROOT/$dest/.git" ]]; then
    git clone "$url" "$ROOT/$dest"
  fi
  if [[ "$(git -C "$ROOT/$dest" rev-parse HEAD)" != "$revision" ]]; then
    git -C "$ROOT/$dest" checkout --detach "$revision"
  fi
  git -C "$ROOT/$dest" submodule update --init --recursive
}

if [[ -f "$ROOT/.paquete-completo" ]]; then
  # El ZIP completo ya contiene las revisiones fijadas y los submódulos.
  for file in "$ROOT/sources/tmwa/src/wire/packets.hpp" \
              "$ROOT/sources/serverdata/client-data/maps/029-2.tmx" \
              "$ROOT/sources/mana/libs/guichan/CMakeLists.txt"; do
    [[ -f "$file" ]] || { echo "ZIP incompleto: falta $file" >&2; exit 1; }
  done
elif [[ -e "$ROOT/.git" ]]; then
  git -C "$ROOT" submodule update --init --recursive
else
  clone_pinned sources/tmwa https://github.com/themanaworld/tmwa.git fe83504049c2414bb0df12574a447cd63c162c96
  clone_pinned sources/serverdata https://github.com/themanaworld/tmwa-server-data.git 394c167597b4b76ced2f4b5333a5e5f77959258d
  clone_pinned sources/mana https://github.com/mana/mana.git 6c1e41d28f2274a4aede383f2e331b2130ef34b9
fi

"$ROOT/scripts/preparar-traduccion.sh"
echo "Fuentes listas. Ejecuta: ./scripts/instalar.sh"
