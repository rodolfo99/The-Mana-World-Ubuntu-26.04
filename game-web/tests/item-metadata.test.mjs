import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { inventoryWithMetadata, loadItemMetadata } from '../backend/item-metadata.mjs';
import { GameSession } from '../backend/session.mjs';
import { packet } from '../backend/protocol.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const originalAssets = join(repoRoot, 'sources/serverdata/client-data');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tmw-items-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'client-data');
  mkdirSync(root);
  const put = (path, contents) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    return file;
  };
  // Resource bytes and these two item definitions are copied from the pinned
  // catalog, not a separately maintained table of names or invented assets.
  const image = 'use/potions/a.png';
  put(`graphics/items/${image}`, readFileSync(join(originalAssets, 'graphics/items', image)));
  return { root, directory, put, image };
}

test('loads inline items, recursive root-relative includes, XML escapes and original dye image paths', t => {
  const { root, put, image } = fixture(t);
  put('items.xml', `<items><item id="1203" name="Ranger Hat"/><include name="items/usable/_include.xml"/></items>`);
  put('items/usable/_include.xml', '<items><include name="items/usable/item0501.xml"/><include name="items/usable/item0502.xml"/><item id="1203" name="Ranger &amp; &quot;Hat&quot; &#xE1;"/></items>');
  for (const id of [501, 502]) {
    const filename = id === 501 ? 'item0501_CactusDrink.xml' : 'item0502_CactusPotion.xml';
    put(`items/usable/item0${id}.xml`, readFileSync(join(originalAssets, 'items/usable', filename)));
  }
  const catalog = loadItemMetadata(root);
  assert.deepEqual([...catalog.keys()], [1203, 501, 502]);
  assert.deepEqual(catalog.get(501), { name: 'Cactus Drink', iconUrl: `/assets/graphics/items/${image}` });
  assert.deepEqual(catalog.get(502), { name: 'Cactus Potion', iconUrl: `/assets/graphics/items/${image}` });
  assert.deepEqual(catalog.get(1203), { name: 'Ranger & "Hat" á' });
});

test('missing fields, unknown IDs and missing catalogs keep independent name/icon fallbacks', t => {
  const { root, put, image } = fixture(t);
  assert.equal(loadItemMetadata(root).size, 0);
  assert.equal(loadItemMetadata(join(root, 'absent')).size, 0);
  put('items.xml', `<items>
    <item id="501" name="Cactus Drink" image="absent.png"/>
    <item id="502" name="   " image="${image}"/>
    <item id="503"/><item id="-1" name="sprite"/><item id="0" name="zero"/>
    <item id="65536" name="overflow"/><item id="5.5" name="fraction"/>
    <item id="501suffix" name="partial"/><item name="missing ID"/>
    <item id="504" name="${'x'.repeat(257)}"/>
  </items>`);
  const catalog = loadItemMetadata(root);
  assert.equal(catalog.size, 4);
  assert.deepEqual(catalog.get(501), { name: 'Cactus Drink' });
  assert.deepEqual(catalog.get(502), { iconUrl: `/assets/graphics/items/${image}` });
  assert.deepEqual(catalog.get(503), {});
  assert.deepEqual(catalog.get(504), {});
  const unknown = { id: 65000, slot: 9, amount: 3, equipped: false };
  assert.deepEqual(inventoryWithMetadata([unknown], catalog), [unknown]);
});

test('cycles, repeated or missing includes and malformed XML do not discard healthy siblings', t => {
  const { root, put } = fixture(t);
  put('items.xml', `<items>
    <include name="items/missing.xml"/><include name="items/bad.xml"/>
    <include name="items/wrong-root.xml"/><include name="items/a.xml"/>
    <include name="items/a.xml"/><item id="502" name="Cactus Potion"/>
  </items>`);
  put('items/a.xml', '<items><include name="items.xml"/><item id="501" name="Cactus Drink"/></items>');
  put('items/bad.xml', '<items><item id="503" name="must be discarded"/><item></items>');
  put('items/wrong-root.xml', '<html><item id="504" name="must be discarded"/></html>');
  assert.deepEqual([...loadItemMetadata(root).keys()], [501, 502]);
  put('items.xml', '<items><item id="501" name="Cactus Drink"/>');
  assert.equal(loadItemMetadata(root).size, 0);
});

test('rejects DTDs, external and internal entities without loading or expanding their contents', t => {
  const { root, directory, put } = fixture(t);
  writeFileSync(join(directory, 'secret.txt'), 'private fixture');
  put('items.xml', '<items><include name="items/external.xml"/><include name="items/internal.xml"/><include name="items/entity.xml"/><item id="501" name="Cactus Drink"/></items>');
  put('items/external.xml', `<!DOCTYPE items [<!ENTITY secret SYSTEM "file://${directory}/secret.txt">]><items><item id="502" name="&secret;"/></items>`);
  put('items/internal.xml', '<!DOCTYPE items [<!ENTITY a "expanded">]><items><item id="503" name="&a;"/></items>');
  put('items/entity.xml', '<items><item id="504" name="&unknown;"/></items>');
  assert.deepEqual([...loadItemMetadata(root)], [[501, { name: 'Cactus Drink' }]]);
});

test('rejects traversal, URLs, encoded paths, unsupported images and symlinks outside the asset roots', t => {
  const { root, directory, put, image } = fixture(t);
  const outsideXml = join(directory, 'outside.xml');
  writeFileSync(outsideXml, '<items><item id="600" name="outside"/></items>');
  const outsidePng = join(directory, 'outside.png');
  writeFileSync(outsidePng, readFileSync(join(root, 'graphics/items', image)));
  const includes = ['../outside.xml', outsideXml, 'https://example.invalid/items.xml',
    '//example.invalid/items.xml', '%2e%2e/outside.xml', 'items/../../outside.xml',
    'items\\outside.xml', 'items/link.xml'];
  const images = ['../outside.png', outsidePng, 'https://example.invalid/a.png',
    '//example.invalid/a.png', '%2e%2e/outside.png', 'data:image/png;base64,AA',
    'use/../../../outside.png', 'use\\outside.png', 'x.png?remote=1', 'x.svg', 'link.png'];
  put('items.xml', `<items>${includes.map(name => `<include name="${name}"/>`).join('')}
    ${images.map((path, index) => `<item id="${501 + index}" name="Cactus Drink" image="${path}"/>`).join('')}
  </items>`);
  mkdirSync(join(root, 'items'));
  symlinkSync(outsideXml, join(root, 'items/link.xml'));
  symlinkSync(outsidePng, join(root, 'graphics/items/link.png'));
  const catalog = loadItemMetadata(root);
  assert.equal(catalog.has(600), false);
  assert.equal(catalog.size, images.length);
  for (const entry of catalog.values()) assert.deepEqual(entry, { name: 'Cactus Drink' });
  // A symlink replacing the entire images directory must also stay contained.
  rmSync(join(root, 'graphics/items'), { recursive: true });
  symlinkSync(directory, join(root, 'graphics/items'));
  put('items.xml', '<items><item id="501" name="Cactus Drink" image="outside.png"/></items>');
  assert.deepEqual(loadItemMetadata(root).get(501), { name: 'Cactus Drink' });
});

test('limits include depth, reference count, XML nesting and individual file size', t => {
  const { root, put } = fixture(t);
  put('items.xml', '<items><include name="items/1.xml"/><include name="items/huge.xml"/><include name="items/nested.xml"/><item id="501" name="Cactus Drink"/></items>');
  for (let depth = 1; depth <= 17; depth++)
    put(`items/${depth}.xml`, `<items><include name="items/${depth + 1}.xml"/><item id="${depth + 600}" name="depth ${depth}"/></items>`);
  put('items/huge.xml', `<items><!--${'x'.repeat(256 * 1024)}--><item id="700" name="too large"/></items>`);
  put('items/nested.xml', `<items><item id="701" name="too deep"/>${'<a>'.repeat(65)}${'</a>'.repeat(65)}</items>`);
  const catalog = loadItemMetadata(root);
  assert.equal(catalog.has(616), true);
  assert.equal(catalog.has(617), false);
  assert.equal(catalog.has(700), false);
  assert.equal(catalog.has(701), false);
  assert.equal(catalog.has(501), true);
  put('items.xml', `<items>${'<include name="items/missing.xml"/>'.repeat(4096)}<include name="items/1.xml"/><item id="501" name="Cactus Drink"/></items>`);
  assert.deepEqual([...loadItemMetadata(root).keys()], [501]);
});

test('the total XML byte budget is bounded even with many valid small files', t => {
  const { root, put } = fixture(t);
  const files = 65;
  put('items.xml', `<items>${Array.from({ length: files }, (_, i) => `<include name="items/${i}.xml"/>`).join('')}</items>`);
  for (let i = 0; i < files; i++)
    put(`items/${i}.xml`, `<items><!--${'x'.repeat(256 * 1024 - 100)}--><item id="${501 + i}" name="budget fixture"/></items>`);
  const catalog = loadItemMetadata(root);
  assert.equal(catalog.has(501), true);
  assert.ok(catalog.size < files);
  assert.equal(catalog.has(565), false);
});

test('the pinned original catalog supplies existing local PNGs and no invented fallback names', () => {
  const catalog = loadItemMetadata(originalAssets);
  assert.ok(catalog.size > 1000, 'Initialize the pinned client-data submodule for this integration test');
  assert.deepEqual(catalog.get(501), { name: 'Cactus Drink', iconUrl: '/assets/graphics/items/use/potions/a.png' });
  assert.deepEqual(catalog.get(1203), { name: 'Ranger Hat', iconUrl: '/assets/graphics/items/equipment/head/rangerhat.png' });
  for (const { iconUrl } of catalog.values()) {
    if (iconUrl) assert.doesNotThrow(() => readFileSync(join(originalAssets, decodeURIComponent(iconUrl.slice('/assets/'.length)))));
  }
});

test('metadata accompanies every inventory update without changing quantities, equipment, slots or commands', t => {
  const { root, put, image } = fixture(t);
  put('items.xml', `<items><item id="501" name="Cactus Drink" image="${image}"/><item id="1203" name="Ranger Hat"/></items>`);
  const messages = [], sent = [];
  const session = new GameSession({ readyState: 1, send: data => messages.push(JSON.parse(data)) }, new Map(), undefined,
    { itemMetadata: loadItemMetadata(root) });
  session.phase = 'map';
  session.socket = { writable: true, write: data => sent.push(data), destroy() {} };
  t.after(() => session.close());
  const inventory = packet(0x01ee, 22);
  inventory.writeUInt16LE(22, 2);
  inventory.writeUInt16LE(7, 4); // UI slot 5, independent of the metadata ID.
  inventory.writeUInt16LE(501, 6);
  inventory.writeUInt16LE(3, 10);
  session.receive(0x01ee, inventory);
  const initial = { slot: 5, id: 501, amount: 3, equipped: false };
  assert.deepEqual(session.inventory.get(5), initial); // Protocol state stays undecorated.
  assert.deepEqual(messages.at(-1).items, [{ ...initial, name: 'Cactus Drink', iconUrl: `/assets/graphics/items/${image}` }]);

  const equipment = packet(0x00a4, 24);
  equipment.writeUInt16LE(8, 4);
  equipment.writeUInt16LE(1203, 6);
  session.receive(0x00a4, equipment);
  session.command({ type: 'use', slot: 5 });
  assert.equal(sent.at(-1).readUInt16LE(0), 0x00a7);
  assert.equal(sent.at(-1).readUInt16LE(2), 7);
  assert.equal(sent.at(-1).readUInt32LE(4), 501);
  for (const [type, request, reply, equipped] of [['equip', 0x00a9, 0x00aa, true], ['unequip', 0x00ab, 0x00ac, false]]) {
    session.command({ type, slot: 6 });
    assert.equal(sent.at(-1).readUInt16LE(0), request);
    assert.equal(sent.at(-1).readUInt16LE(2), 8);
    const update = packet(reply, 7);
    update.writeUInt16LE(8, 2);
    update[6] = 1;
    session.receive(reply, update);
    assert.deepEqual(messages.at(-1).items.find(item => item.slot === 6), { slot: 6, id: 1203, amount: 1, equipped, name: 'Ranger Hat' });
  }
  const added = packet(0x00a0, 23);
  added.writeUInt16LE(7, 2);
  added.writeUInt16LE(2, 4);
  added.writeUInt16LE(501, 6);
  session.receive(0x00a0, added);
  assert.equal(messages.at(-1).items[0].amount, 5);
  assert.equal(messages.at(-1).items[0].name, 'Cactus Drink');
  const removed = packet(0x00af, 6);
  removed.writeUInt16LE(7, 2);
  removed.writeUInt16LE(1, 4);
  session.receive(0x00af, removed);
  assert.equal(messages.at(-1).items[0].amount, 4);
  assert.equal(messages.at(-1).items[0].iconUrl, `/assets/graphics/items/${image}`);
  removed.writeUInt16LE(4, 4);
  session.receive(0x00af, removed);
  assert.equal(messages.at(-1).items.some(item => item.slot === 5), false);
  added.writeUInt16LE(65000, 6); // Unknown object reuses a previously named slot.
  session.receive(0x00a0, added);
  assert.deepEqual(messages.at(-1).items.find(item => item.slot === 5), { slot: 5, id: 65000, amount: 2 });
});
