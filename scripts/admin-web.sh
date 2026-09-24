#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/admin-web"
if [[ "$(id -u)" -eq 0 ]]; then
  echo "Ejecuta este script con tu usuario habitual, sin sudo." >&2
  exit 1
fi
command -v node >/dev/null || { echo "Instala Node.js 22.22.3, 24.15 o posterior compatible con Angular 22." >&2; exit 1; }
command -v npm >/dev/null || { echo "Instala npm para compilar Angular." >&2; exit 1; }
if ! node -e 'const [major,minor,patch]=process.versions.node.split(".").map(Number);const compatible=(major===22&&(minor>22||minor===22&&patch>=3))||(major===24&&minor>=15)||major>=26;process.exitCode=compatible?0:1'; then
  echo "Node.js incompatible; usa 22.22.3+, 24.15+ o 26+." >&2
  exit 1
fi
[[ -x "$ROOT/instalado/bin/tmwa-admin" ]] || { echo "Ejecuta primero ./scripts/instalar.sh." >&2; exit 1; }
[[ -f "$ROOT/sources/serverdata/login/conf/ladmin_local.conf" ]] || { echo "Falta la configuración de administración local." >&2; exit 1; }
cd "$WEB"
INDEX="$WEB/dist/admin-web/browser/index.html"
if [[ ! -f "$INDEX" ]] ||
   find "$WEB/src" "$WEB/angular.json" "$WEB/package.json" "$WEB/package-lock.json" \
     -type f -newer "$INDEX" -print -quit | grep -q .; then
  npm ci
  npm run build
fi
exec node backend/server.mjs
