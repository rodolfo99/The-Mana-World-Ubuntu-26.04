"""Regresiones de español: submódulos, repetición y conservación de datos."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


HELPER = Path(__file__).resolve().parents[1] / 'preparar-traduccion.sh'


def patch(path, original, translated):
    return (f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n'
            f'@@ -1 +1 @@\n-{original}\n+{translated}\n')


class PrepareTranslation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='tmw español (test) ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'patches').mkdir()
        (self.root / 'localizacion').mkdir()
        shutil.copy2(HELPER, self.root / 'scripts/preparar-traduccion.sh')
        for name in ('serverdata', 'mana'):
            project = self.root / 'sources' / name
            project.mkdir(parents=True)
            subprocess.run(['git', 'init', '-q', str(project)], check=True)
            # The real submodules have a .git FILE, not a .git directory.
            metadata = self.root / f'git-{name}'
            (project / '.git').rename(metadata)
            (project / '.git').write_text(f'gitdir: {metadata}\n')
        self.npc = self.root / 'sources/serverdata/world/map/npc/test.txt'
        self.npc.parent.mkdir(parents=True)
        self.npc.write_text('mes "Hello";\n')
        native = self.root / 'sources/mana/po/CMakeLists.txt'
        native.parent.mkdir()
        native.write_text('set(LOCALE original)\n')
        (self.root / 'patches/mana-po.patch').write_text(
            patch('po/CMakeLists.txt', 'set(LOCALE original)', 'set(LOCALE prepared)'))
        files = {
            'npc-es.patch': patch('world/map/npc/test.txt', 'mes "Hello";', 'mes "Hola";'),
            'npc_es.json': json.dumps({'Hello': 'Hola'}),
        }
        checksums = []
        for name, content in files.items():
            data = content.encode()
            encoded = base64.b64encode(gzip.compress(data))
            (self.root / 'localizacion' / f'{name}.gz.b64.part-000').write_bytes(encoded)
            checksums.append(f'{hashlib.sha256(data).hexdigest()}  {name}\n')
        (self.root / 'localizacion/SHA256SUMS').write_text(''.join(checksums))
        self.distance = self.npc.parent / 'distance.txt'
        self.distance.write_text('message "Move closer";\n')
        (self.root / 'localizacion/npc-interaccion-es.patch').write_text(
            patch('world/map/npc/distance.txt', 'message "Move closer";', 'message "Acércate";'))
        self.account = self.root / 'sources/serverdata/login/save/account.txt'
        self.account.parent.mkdir(parents=True)
        self.account.write_text('cuenta y progreso de prueba\n')

    def run_helper(self):
        return subprocess.run(['bash', str(self.root / 'scripts/preparar-traduccion.sh')],
                              capture_output=True, text=True)

    def test_applies_once_with_git_files_and_keeps_accounts(self):
        first = self.run_helper()
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(self.npc.read_text(), 'mes "Hola";\n')
        self.assertEqual(self.distance.read_text(), 'message "Acércate";\n')
        second = self.run_helper()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.npc.read_text(), 'mes "Hola";\n')
        self.assertEqual(self.account.read_text(), 'cuenta y progreso de prueba\n')

    def test_conflicting_manual_dialogue_is_not_overwritten(self):
        custom = 'mes "Una traducción personal";\n'
        self.npc.write_text(custom)
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.npc.read_text(), custom)
        self.assertIn('cambios locales incompatibles', result.stderr)

    def test_modified_catalog_is_not_replaced(self):
        catalog = self.root / 'localizacion/npc_es.json'
        custom = '{"Hello": "Buenos días"}'
        catalog.write_text(custom)
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(catalog.read_text(), custom)
        self.assertEqual(self.npc.read_text(), 'mes "Hello";\n')

    def test_extra_patch_conflict_preserves_both_files(self):
        self.distance.write_text('message "Aviso personal";\n')
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.distance.read_text(), 'message "Aviso personal";\n')
        self.assertEqual(self.npc.read_text(), 'mes "Hello";\n')


if __name__ == '__main__':
    unittest.main()
