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

# Validate overlapping patch layers in isolated copies before changing sources.
# Only files named by the patches are copied; accounts and game progress are not.
workspace="$(mktemp -d)"
trap 'rm -rf "$workspace"' EXIT
projects=()
patches=()
prepare_project() {
  local project="$1"; shift
  local layers=("$@") stage patch path index
  local additions deletions
  [[ -e "$project/.git" ]] || { echo "Faltan fuentes Git en $project. Ejecuta ./scripts/preparar-fuentes.sh." >&2; exit 1; }
  stage="$(mktemp -d "$workspace/project.XXXXXX")"
  git init -q "$stage"
  for patch in "${layers[@]}"; do
    while IFS=$'\t' read -r additions deletions path; do
      [[ -n "$path" ]] || continue
      # Repository patches only modify existing files. Never synthesize a
      # missing source or overwrite a user's file to make a patch fit.
      [[ -f "$project/$path" ]] || { echo "Falta $project/$path; se conservan las fuentes." >&2; exit 1; }
      mkdir -p "$stage/$(dirname "$path")"
      cp -p "$project/$path" "$stage/$path"
    done < <(git -C "$project" apply --numstat "$patch")
  done
  git -C "$stage" -c core.autocrlf=false add --all
  # Peel already applied layers backwards, including corrections that overlap
  # the base translation. Then build the complete desired state forwards.
  for ((index=${#layers[@]}-1; index>=0; index--)); do
    patch="${layers[$index]}"
    if git -C "$stage" apply --reverse --check "$patch" >/dev/null 2>&1; then
      git -C "$stage" apply --reverse "$patch"
    fi
  done
  for patch in "${layers[@]}"; do
    if ! git -C "$stage" apply --check "$patch"; then
      echo "Hay cambios locales incompatibles en $project. No se han sustituido; revisa el conflicto del parche $(basename "$patch")." >&2
      exit 1
    fi
    git -C "$stage" apply "$patch"
  done
  patch="$stage.patch"
  git -C "$stage" -c core.autocrlf=false diff --no-ext-diff --binary > "$patch"
  if [[ -s "$patch" ]]; then
    git -C "$project" apply --check "$patch"
    projects+=("$project"); patches+=("$patch")
  else
    echo "Traducción/preparación ya aplicada: $(basename "$project")"
  fi
}

if [[ "$MODE" != --cliente ]]; then
  unpack_verified npc-es.patch
  unpack_verified npc_es.json
  npc_patches=("$ROOT/localizacion/npc-es.patch")
  for name in npc-interaccion-es.patch npc-correcciones-es.patch; do
    if [[ -f "$ROOT/localizacion/$name" ]]; then
      npc_patches+=("$ROOT/localizacion/$name")
    fi
  done
  prepare_project "$ROOT/sources/serverdata" "${npc_patches[@]}"
fi
if [[ "$MODE" != --npc ]]; then
  prepare_project "$ROOT/sources/mana" "$ROOT/patches/mana-po.patch"
fi
for index in "${!projects[@]}"; do
  git -C "${projects[$index]}" apply "${patches[$index]}"
  echo "Aplicado: español/preparación en $(basename "${projects[$index]}")"
done
echo "Español preparado."
