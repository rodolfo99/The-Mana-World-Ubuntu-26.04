#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/sources/serverdata"
[[ -f "$DATA/login/conf/login_local.conf" ]] || {
  echo "Prepara primero los datos con scripts/instalar.sh o 'make -C sources/serverdata maps conf news' y 'python3 scripts/configurar-local.py sources/serverdata'." >&2
  exit 1
}
command -v docker >/dev/null || { echo "Docker no está instalado." >&2; exit 1; }
export UID
export GID="$(id -g)"
case "${1:-}" in
  up) exec docker compose -f "$DATA/docker-compose.yml" --project-name tmw-local up -d ;;
  down) exec docker compose -f "$DATA/docker-compose.yml" --project-name tmw-local down ;;
  logs) exec docker compose -f "$DATA/docker-compose.yml" --project-name tmw-local logs -f ;;
  ps) exec docker compose -f "$DATA/docker-compose.yml" --project-name tmw-local ps ;;
  *) echo "Uso: $0 {up|down|logs|ps}" >&2; exit 2 ;;
esac
