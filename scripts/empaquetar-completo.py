#!/usr/bin/env python3
"""Crea una copia portable de los fuentes y recursos, sin datos personales."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
NAME = 'The-Mana-World-Ubuntu-26.04-angular-v0.2.2'
REQUIRED = (
    'sources/tmwa/src/wire/packets.hpp',
    'sources/mana/src/net/tmwa/protocol.h',
    'sources/mana/libs/guichan/CMakeLists.txt',
    'sources/serverdata/client-data/maps/029-2.tmx',
    'sources/serverdata/client-data/graphics/sprites/races/human-male.png',
    'sources/serverdata/tools',
    'game-web/package-lock.json',
)
SKIP_DIRS = {'node_modules', 'dist', 'build-local', '.angular', 'instalado', 'respaldos', '__pycache__', 'logs', 'hooks'}
SAVE_DIRS = {'sources/serverdata/login/save', 'sources/serverdata/world/save',
             'sources/serverdata/world/map/save'}
SKIP_FILES = {'.env', '.env.local', 'ladmin_local.conf', 'login_local.conf'}
PRIMARY_GIT = {f'sources/{name}/.git' for name in ('mana', 'tmwa', 'serverdata')}
PUBLIC_REMOTES = {
    'mana': 'https://github.com/mana/mana.git',
    'serverdata': 'https://github.com/themanaworld/tmwa-server-data.git',
    'tmwa': 'https://github.com/themanaworld/tmwa.git',
}


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if path.name == '.git' and rel not in PRIMARY_GIT:
        return False
    if path.name in SKIP_FILES or path.name.endswith(('.pyc', '.log', '.swp', '.tmp')):
        return False
    if rel.startswith('sources/serverdata/') and not path.name.endswith('.example') and ('_local.conf' in path.name or 'local_' in path.name):
        return False
    if any(rel == saved or rel.startswith(saved + '/') for saved in SAVE_DIRS):
        return path.name == '.gitignore' or path.name.endswith('.example')
    return True


def archive_config(path: str) -> str:
    core = '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n'
    if path == '.git/config':
        return core + ('[remote "origin"]\n\turl = https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04.git\n'
                       '\tfetch = +refs/heads/*:refs/remotes/origin/*\n')
    name = path.split('/')[3]
    return core + (f'\tworktree = ../../../../sources/{name}\n'
                   f'[remote "origin"]\n\turl = {PUBLIC_REMOTES[name]}\n'
                   '\tfetch = +refs/heads/*:refs/remotes/origin/*\n')


def main() -> None:
    missing = [name for name in REQUIRED if not (ROOT / name).exists()]
    if missing:
        sys.exit('Faltan fuentes/recursos. Ejecuta git submodule update --init --recursive: ' + ', '.join(missing))
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / f'{NAME}.zip'
    if target.is_relative_to(ROOT):
        sys.exit('El ZIP debe guardarse fuera del repositorio para evitar incluirse a sí mismo.')
    # El archivo completo debe contener los diálogos traducidos, no solo el parche.
    subprocess.run([str(ROOT / 'scripts/preparar-traduccion.sh')], check=True)
    count = 0
    with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for folder, dirs, files in os.walk(ROOT):
            relative_folder = Path(folder).relative_to(ROOT).as_posix()
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and
                             not (d == '.git' and relative_folder != '.') and
                             not (d == 'modules' and relative_folder in
                                  {f'.git/modules/sources/{name}' for name in PUBLIC_REMOTES}))
            for filename in sorted(files):
                path = Path(folder) / filename
                if not include(path) or path.is_symlink() or not path.is_file():
                    continue
                arc = Path(NAME) / path.relative_to(ROOT)
                rel = path.relative_to(ROOT).as_posix()
                if rel == '.git/config' or rel in {f'.git/modules/sources/{name}/config' for name in PUBLIC_REMOTES}:
                    archive.writestr(arc.as_posix(), archive_config(rel))
                else:
                    archive.write(path, arc.as_posix())
                count += 1
        archive.writestr(f'{NAME}/.paquete-completo',
                         'Incluye fuentes, recursos y metadatos Git mínimos de los tres proyectos principales.\n')
    print(f'{target} ({count} archivos, {target.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
