#!/usr/bin/env bash
# Aplica el español sin actualizar submódulos ni sustituir cambios personales.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---todo}"
case "$MODE" in --todo|--npc|--cliente) ;; *) echo "Uso: $0 [--todo|--npc|--cliente]" >&2; exit 2 ;; esac

unpack_verified() {
  local name="$1" output="$ROOT/localizacion/$1" expected actual tmp
  expected="$(awk -v name="$name" '$2 == name {print $1}' "$ROOT/localizacion/SHA256SUMS")"
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo "Falta la suma de $name." >&2; exit 1; }
  if [[ -f "$output" ]]; then
    actual="$(sha256sum < "$output" | cut -d' ' -f1)"
    if [[ "$actual" == "$expected" ]]; then return; fi
    echo "$output tiene cambios locales; se conservan. Guarda una copia antes de reconstruirlo." >&2
    exit 1
  fi
  tmp="$(mktemp "$ROOT/localizacion/.${name}.XXXXXX")"
  if ! cat "$ROOT/localizacion/$name".gz.b64.part-* | base64 --decode | gzip -dc > "$tmp"; then
    rm -f "$tmp"; echo "No se pudo reconstruir $name." >&2; exit 1
  fi
  actual="$(sha256sum < "$tmp" | cut -d' ' -f1)"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$tmp"; echo "La verificación SHA-256 de $name falló." >&2; exit 1
  fi
  mv "$tmp" "$output"
}

projects=()
patches=()
check_patch() {
  local project="$1" patch="$2"
  [[ -e "$project/.git" ]] || { echo "Faltan fuentes Git en $project. Ejecuta ./scripts/preparar-fuentes.sh." >&2; exit 1; }
  if git -C "$project" apply --reverse --check "$patch" >/dev/null 2>&1; then
    echo "Traducción/preparación ya aplicada: $(basename "$patch")"
  elif git -C "$project" apply --check "$patch"; then
    projects+=("$project"); patches+=("$patch")
  else
    echo "Hay cambios locales incompatibles en $project. No se han sustituido; revisa el conflicto del parche." >&2
    exit 1
  fi
}

if [[ "$MODE" != --cliente ]]; then
  unpack_verified npc-es.patch
  unpack_verified npc_es.json
  check_patch "$ROOT/sources/serverdata" "$ROOT/localizacion/npc-es.patch"
fi
if [[ "$MODE" != --npc ]]; then
  check_patch "$ROOT/sources/mana" "$ROOT/patches/mana-po.patch"
fi
for index in "${!projects[@]}"; do
  git -C "${projects[$index]}" apply "${patches[$index]}"
  echo "Aplicado: $(basename "${patches[$index]}")"
done
echo "Español preparado."
