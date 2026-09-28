import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNpcMetadata } from '../backend/npc-metadata.mjs';
import { dyePixels, instantiateDye, npcFrame } from '../src/app/npc-sprites.ts';

test('pinned NPC definitions retain layer order, palettes, variants and explicit empty fallbacks', () => {
  const catalog = loadNpcMetadata(fileURLToPath(new URL('../../sources/serverdata/client-data', import.meta.url)));
  assert.equal(catalog.get(154).length, 6);
  assert.match(catalog.get(154)[0].file, /^model\/female.xml\|#53202b/);
  assert.match(catalog.get(154)[5].file, /^equipment\/feet\/boots-female.xml\|/);
  assert.deepEqual(catalog.get(200), [{ file: 'npcs/2006__npcs.xml', variant: 5 }]);
  assert.equal(catalog.get(400), null);
  assert.equal(catalog.get(999), undefined);
});

test('NPC includes are bounded and contained; malformed, particle and partial definitions keep fallbacks', t => {
  const root = mkdtempSync(join(tmpdir(), 'tmw-npcs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'npcs'));
  const npc = '<npc id="154"><sprite>model/female.xml|#ffffff</sprite><sprite variant="2">model/unique.xml</sprite></npc>';
  writeFileSync(join(root, 'npcs.xml'), `<npcs><include name="npcs/good.xml"/><include name="npcs/bad.xml"/>
    <include name="../escape.xml"/><include name="/etc/passwd"/><include name="https://invalid/npcs.xml"/>
    <include name="npcs/outside.xml"/><include name="npcs/large.xml"/>
    <npc id="400"/><npc id="100"><sprite>../outside.xml</sprite></npc>
    <npc id="101"><sprite>model/unique.xml</sprite><particlefx>effect.xml</particlefx></npc></npcs>`);
  writeFileSync(join(root, 'npcs/good.xml'), `<npcs><include name="npcs.xml"/>${npc}</npcs>`);
  writeFileSync(join(root, 'npcs/bad.xml'), `<npcs>${npc}<npc></npcs>`);
  writeFileSync(join(root, 'npcs/large.xml'), `<npcs>${' '.repeat(300000)}${npc}</npcs>`);
  symlinkSync('/etc/passwd', join(root, 'npcs/outside.xml'));
  const catalog = loadNpcMetadata(root);
  assert.equal(catalog.get(154).length, 2);
  assert.deepEqual([...catalog.keys()], [154, 400, 100, 101]);
  assert.equal(catalog.get(100), null); assert.equal(catalog.get(101), null);
  writeFileSync(join(root, 'npcs.xml'), `<!DOCTYPE npcs [<!ENTITY custom "bad">]><npcs>${npc}</npcs>`);
  assert.equal(loadNpcMetadata(root).size, 0);
  assert.equal(loadNpcMetadata(join(root, 'absent')).size, 0);
});

test('Mana dye interpolation transforms only pure channels and preserves alpha', () => {
  const pixels = new Uint8ClampedArray([255,255,255,80, 128,128,128,255, 255,0,0,255,
    0,255,0,255, 0,0,255,255, 128,64,0,255, 0,0,0,255, 64,64,64,0]);
  dyePixels(pixels, 'W:#804020,ffffff;R:#00ff00;B:#ff0000');
  assert.deepEqual([...pixels], [255,255,255,80, 128,64,32,255, 0,255,0,255,
    0,255,0,255, 255,0,0,255, 128,64,0,255, 0,0,0,255, 64,32,16,0]);
  assert.equal(instantiateDye('body.png|W;B:#010203;R', '#123456;#abcdef'), 'body.png|W:#123456;B:#010203;R:#abcdef');
  assert.equal(instantiateDye('head.png|W;Y;G;C;B;M;R', ''), 'head.png'); // native identity template
  assert.throws(() => instantiateDye('body.png|W;B', '#ffffff'), /Falta/);
  assert.throws(() => dyePixels(pixels, 'W:not-a-palette'), /Paleta/);
});

test('standing animation uses Mana direction fallback, elapsed time and delay-zero freeze', () => {
  const up = [{ index: 36, delay: 75 }, { index: 37, delay: 75 }];
  const layer = { animations: new Map([['down', [{ index: 0, delay: 0 }]], ['up', up]]) };
  assert.equal(npcFrame(layer, 'upright', 76).index, 37);
  assert.equal(npcFrame(layer, 'up', 150).index, 37);
  assert.equal(npcFrame(layer, 'up', 151).index, 36);
  assert.equal(npcFrame(layer, 'left', 0).index, 36); // enum up precedes down, regardless of XML order
  layer.animations.set('default', [{ index: 90, delay: 0 }]);
  assert.equal(npcFrame(layer, 'right', 99999).index, 90);
  layer.animations.set('down', [{ index: 1, delay: 75 }, { index: 2, delay: 0 }, { index: 3, delay: 75 }]);
  assert.equal(npcFrame(layer, 'down', 99999).index, 2);
});
