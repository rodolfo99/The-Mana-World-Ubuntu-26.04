#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/sources/serverdata"
PATCH="$ROOT/localizacion/npc-es.patch"
[[ -f "$PATCH" && -d "$DATA/.git" ]] || {
  echo "Faltan las fuentes Git o localizacion/npc-es.patch." >&2; exit 1;
}
if git -C "$DATA" apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "Los diálogos en español ya están aplicados."
  exit 0
fi
if ! git -C "$DATA" apply --check "$PATCH"; then
  echo "El parche no coincide con estos archivos. Conserva tus cambios y revisa el conflicto." >&2
  exit 1
fi
git -C "$DATA" apply "$PATCH"
echo "Diálogos traducidos. Reinicia el servidor para cargarlos."
