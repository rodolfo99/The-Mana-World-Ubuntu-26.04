"""Translation must preserve executable identifiers and concatenation boundaries."""
import base64
import collections
import gzip
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('npc_es', ROOT / 'scripts/npc_es.py')
npc_es = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(npc_es)


class NpcExtraction(unittest.TestCase):
    def test_function_arguments_are_not_visible_translation_candidates(self):
        for before in (
            'mes "Cast " + get(.invocation$, ',
            'mes "Cast " + get(getarg(0), ',
            'mes "Call (this) " + future_api(other(1), ',
            'menu getitemlink(',
        ):
            with self.subTest(before=before):
                self.assertIsNone(npc_es.eligible('spell-wand', before, set()))
        self.assertEqual(npc_es.eligible('Cast now.', 'mes ', set()), 'Cast now.')
        self.assertEqual(npc_es.eligible('again.', 'mes get(.invocation$, "wand") + ', set()),
                         'again.')

    def test_catalog_cannot_change_get_target_and_preserves_join_spaces(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / 'npc.txt'
            script.write_text('mes " Cast this " + get(.invocation$, "spell-wand") + " now. ";\n')
            npc_es.apply_catalog(root, {'Cast this': 'Lanza', 'now.': 'ahora.', 'spell-wand': 'hechizo'})
            self.assertEqual(script.read_text(),
                             'mes " Lanza " + get(.invocation$, "spell-wand") + " ahora. ";\n')

    def test_cli_loads_reviewed_corrections_next_to_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / 'npc.txt'
            script.write_text('mes "The invocation is `" + get(.invocation$, "spell-wand") + " lurk\' for a Skytlurk figurine.";\n')
            catalog = root / 'npc_es.json'
            catalog.write_text(json.dumps({'The invocation is `': 'Mal:',
                                           'spell-wand': 'hechizo-quierd'}))
            corrections = json.loads((ROOT / 'localizacion/npc_es_correcciones.json').read_text())
            (root / 'npc_es_correcciones.json').write_text(json.dumps(corrections))
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/npc_es.py'),
                                     '--npc-dir', str(root), '--catalog', str(catalog), '--apply'],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(script.read_text(),
                             'mes "La invocación es \'" + get(.invocation$, "spell-wand") + " lurk\' para una figura de Skytlurk.";\n')

    def test_condition_on_display_line_is_program_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / 'npc.txt'
            script.write_text('if (@DSTMAP$ != "help") mes "Need help?";\n')
            npc_es.apply_catalog(root, {'help': 'ayuda', 'Need help?': '¿Necesitas ayuda?'})
            self.assertEqual(script.read_text(),
                             'if (@DSTMAP$ != "help") mes "¿Necesitas ayuda?";\n')

    def test_adjacent_commands_only_translate_their_display_statements(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / 'npc.txt'
            script.write_text('set @DSTMAP$, "help"; mes "Need help?"; '
                              'set @DSTMAP$, "help"; mes "Cast now.";\n'
                              'menu "Need help?", L_Help,\n'
                              '    "Cast now.", L_Cast; set @DSTMAP$, "help";\n'
                              'mes "Need help?; Try again."; // mes "Cast now.";\n')
            npc_es.apply_catalog(root, {'help': 'ayuda', 'Need help?': '¿Necesitas ayuda?',
                                       'Cast now.': 'Lanza ahora.',
                                       'Need help?; Try again.': '¿Necesitas ayuda?; Intenta de nuevo.'})
            self.assertEqual(script.read_text(),
                             'set @DSTMAP$, "help"; mes "¿Necesitas ayuda?"; '
                             'set @DSTMAP$, "help"; mes "Lanza ahora.";\n'
                             'menu "¿Necesitas ayuda?", L_Help,\n'
                             '    "Lanza ahora.", L_Cast; set @DSTMAP$, "help";\n'
                             'mes "¿Necesitas ayuda?; Intenta de nuevo."; // mes "Cast now.";\n')


class ShippedPatchSafety(unittest.TestCase):
    def test_combined_patches_restore_all_original_invocation_targets(self):
        encoded = b''.join(path.read_bytes() for path in sorted(
            (ROOT / 'localizacion').glob('npc-es.patch.gz.b64.part-*')))
        base = gzip.decompress(base64.b64decode(encoded)).decode()
        correction = (ROOT / 'localizacion/npc-correcciones-es.patch').read_text()
        deltas = collections.Counter()
        for patch in (base, correction):
            filename = None
            for line in patch.splitlines():
                if line.startswith('+++ b/'):
                    filename = line[6:]
                elif line[:1] in ('+', '-') and not line.startswith(('+++', '---')):
                    for target in re.findall(r'get\(\.invocation\$,\s*"([^"]+)"\)', line):
                        deltas[filename, target] += 1 if line.startswith('+') else -1
        self.assertEqual({key: value for key, value in deltas.items() if value}, {})

    def test_formatted_ched_suffix_keeps_control_marker(self):
        patch = (ROOT / 'localizacion/npc-correcciones-es.patch').read_text()
        translated = [line for line in patch.splitlines()
                      if line.startswith('+') and 'hasta que aprenda a preparar' in line]
        self.assertEqual(len(translated), 1)
        self.assertIn('\\" %%6";', translated[0])
        self.assertIn('practicar \'" + get(.invocation$, "detect-magic") + "\' hasta', translated[0])


if __name__ == '__main__':
    unittest.main()
