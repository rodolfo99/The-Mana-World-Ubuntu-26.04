import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { beingKind, readBeingAppearance } from '../backend/being-appearance.mjs';
import { GameSession } from '../backend/session.mjs';
import { PacketDecoder, loadPacketLengths } from '../backend/protocol.mjs';
import { loadNpcMetadata } from '../backend/npc-metadata.mjs';
import { appearancePacket, layouts } from './fixtures/appearance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lengths = loadPacketLengths(root);
const catalog = loadNpcMetadata(`${root}/sources/serverdata/client-data`);

for (const layout of layouts) {
  test(`appearance 0x${layout.id.toString(16)} preserves slots, sex, direction, status and layout-specific fields`, () => {
    assert.equal(lengths.get(layout.id), layout.size);
    const value = readBeingAppearance(layout.id, appearancePacket(layout, { options: true }));
    assert.deepEqual(value.appearance, { hairStyle: 13, weapon: 101, shield: 303,
      headBottom: 202, headTop: 404, headMid: 505, hairColor: 17, sex: 0,
      ...(layout.hp ? { shoes: 606 } : { clothesColor: 606 }),
      options: { opt0: 4, opt1: 1, opt2: 2, opt3: 8 } });
    assert.deepEqual([value.id, value.job, value.kind, value.speed], [5200, 154, 'npc', 180]);
    assert.deepEqual([value.x, value.y, value.facing], layout.tick ? [301, 499, 'upright'] : [300, 500, 'up']);
    assert.deepEqual([value.hp, value.maxHp], layout.hp ? [70000, 90000] : [undefined, undefined]);
    for (let length = 0; length < layout.size; length++)
      assert.throws(() => readBeingAppearance(layout.id, appearancePacket(layout).subarray(0, length)), /inválido/);
  });
}

test('fragments and concatenated appearance packets publish the original NPC layers without equipping player slots', () => {
  const messages = [], requests = [];
  const session = new GameSession({ readyState: 1, send: value => messages.push(JSON.parse(value)) }, lengths, {}, { npcMetadata: catalog });
  session.send = p => requests.push(p);
  const decoder = new PacketDecoder(lengths, (id, p) => session.receive(id, p));
  const stream = Buffer.concat(layouts.map(layout => appearancePacket(layout)));
  for (let offset = 0; offset < stream.length; offset += 7) decoder.push(stream.subarray(offset, offset + 7));
  assert.equal(messages.length, 5);
  assert.equal(requests.length, 1); // name requested once per entity
  assert.equal(requests[0].readUInt16LE(0), 0x0094);
  for (const message of messages) {
    assert.deepEqual(message.npcSprites, catalog.get(154));
    assert.equal(message.npcSprites.length, 6);
    assert.equal(message.appearance.headTop, 404); // not used to invent an NPC hat
  }
  for (const { job, options } of [{ job: 999 }, { job: 400 }, { job: 154, options: true }]) {
    session.receive(0x0078, appearancePacket(layouts[0], { job, options }));
    assert.equal(messages.at(-1).npcSprites, null);
  }
  const sitting = appearancePacket(layouts[2]); sitting[51] = 2;
  session.receive(0x01d8, sitting);
  assert.equal(messages.at(-1).stance, 'sit');
  assert.equal(messages.at(-1).npcSprites, null);
});

test('Mana type boundaries, portals and all eight network directions are respected', () => {
  for (const [job, kind] of [[25, 'player'], [26, 'unknown'], [45, 'portal'], [46, 'npc'],
    [1000, 'npc'], [1001, 'monster'], [2000, 'monster'], [2001, 'unknown'], [4001, 'player'], [4049, 'player']])
    assert.equal(beingKind(job), kind);
  const expected = ['down', 'downleft', 'left', 'upleft', 'up', 'upright', 'right', 'downright'];
  expected.forEach((facing, direction) => assert.equal(readBeingAppearance(0x0078,
    appearancePacket(layouts[0], { direction })).facing, facing));
  const session = new GameSession({ readyState: 1, send: () => assert.fail('portal/ghost must not appear') }, lengths);
  session.receive(0x0078, appearancePacket(layouts[0], { job: 45 }));
  session.receive(0x0078, appearancePacket(layouts[0], { job: 0, id: 110000000 }));
});
