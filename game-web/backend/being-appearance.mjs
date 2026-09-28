import { destinationAt, positionAt } from './protocol.mjs';

// Mana 6c1e41d: net/tmwa/beinghandler.cpp, MessageIn and protocol.h.
// These are TWO layouts: 0078/007b have HP and shoes; 01d8/9/a have
// shield BEFORE headBottom, guild data instead of HP, and no shoe slot.
const lengths = new Map([[0x0078, 54], [0x007b, 60], [0x01d8, 54], [0x01d9, 53], [0x01da, 60]]);
const directions = ['down', 'downleft', 'left', 'upleft', 'up', 'upright', 'right', 'downright'];

export function beingKind(job) {
  if (job <= 25 || job >= 4001 && job <= 4049) return 'player';
  if (job >= 46 && job <= 1000) return 'npc';
  if (job > 1000 && job <= 2000) return 'monster';
  return job === 45 ? 'portal' : 'unknown';
}

export function readBeingAppearance(packetId, p) {
  if (!lengths.has(packetId) || p.length !== lengths.get(packetId) || p.readUInt16LE(0) !== packetId)
    throw new Error('Paquete de apariencia inválido');
  let offset = 2;
  const u8 = () => p.readUInt8(offset++);
  const u16 = () => { const value = p.readUInt16LE(offset); offset += 2; return value; };
  const u32 = () => { const value = p.readUInt32LE(offset); offset += 4; return value; };
  const id = u32(), speed = u16(), opt1 = u16(), opt2 = u16(), opt0 = u16(), job = u16();
  const moving = packetId === 0x007b || packetId === 0x01da;
  const beingLayout = packetId === 0x0078 || packetId === 0x007b;
  const appearance = { hairStyle: u16(), weapon: u16() };
  let hp, maxHp;
  if (beingLayout) {
    appearance.headBottom = u16();
    if (moving) u32(); // server tick
    appearance.shield = u16();
    appearance.headTop = u16();
    appearance.headMid = u16();
    appearance.hairColor = u16();
    appearance.shoes = u16(); // clothes_color is repurposed here ONLY
    hp = u32(); maxHp = u32();
    u16(); // manner
  } else {
    appearance.shield = u16();
    appearance.headBottom = u16();
    if (moving) u32(); // server tick
    appearance.headTop = u16();
    appearance.headMid = u16();
    appearance.hairColor = u16();
    appearance.clothesColor = u16(); // read but NOT used as shoes by Mana
    u8(); u8(); u32(); u16(); u16(); // head_dir, unused, guild, emblem, manner
  }
  const opt3 = u16();
  u8(); // karma
  appearance.sex = u8();
  appearance.options = { opt0, opt1, opt2, opt3 };
  const source = positionAt(p, offset);
  const coords = moving ? destinationAt(p, offset) : source;
  let facing = moving ? undefined : directions[source.direction];
  if (moving && (coords.x !== source.x || coords.y !== source.y)) {
    const vertical = coords.y < source.y ? 'up' : coords.y > source.y ? 'down' : '';
    const horizontal = coords.x < source.x ? 'left' : coords.x > source.x ? 'right' : '';
    facing = vertical + horizontal;
  }
  offset += moving ? 5 : 3; // MessageIn::readCoordinatePair consumes five bytes
  let stance = 'stand';
  if (!beingLayout) {
    u16(); // GM status, not appearance
    if (packetId === 0x01d8) {
      const state = u8();
      stance = state === 1 ? 'dead' : state === 2 ? 'sit' : 'stand';
    } else if (moving) u8();
  }
  return { id, job, kind: beingKind(job), ...coords, ...(facing ? { facing } : {}),
    speed, stance, appearance, ...(beingLayout ? { hp, maxHp } : {}) };
}
