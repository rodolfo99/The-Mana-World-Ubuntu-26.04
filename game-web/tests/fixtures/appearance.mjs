import { packet } from '../../backend/protocol.mjs';

// Synthetic wire fixtures, independently laid out from pinned beinghandler.cpp.
// Deliberately distinct slot values detect confusion between the two families.
export const layouts = [
  { id: 0x0078, size: 54, coord: 46, sex: 45, bottom: 20, shield: 22, top: 24, mid: 26, color: 28, clothes: 30, hp: 32, options: 42 },
  { id: 0x007b, size: 60, coord: 50, sex: 49, bottom: 20, shield: 26, top: 28, mid: 30, color: 32, clothes: 34, hp: 36, options: 46, tick: 22 },
  { id: 0x01d8, size: 54, coord: 46, sex: 45, bottom: 22, shield: 20, top: 24, mid: 26, color: 28, clothes: 30, options: 42 },
  { id: 0x01d9, size: 53, coord: 46, sex: 45, bottom: 22, shield: 20, top: 24, mid: 26, color: 28, clothes: 30, options: 42 },
  { id: 0x01da, size: 60, coord: 50, sex: 49, bottom: 22, shield: 20, top: 28, mid: 30, color: 32, clothes: 34, options: 46, tick: 24 },
];

export function appearancePacket(layout, { job = 154, id = 5200, direction = 4, options = false } = {}) {
  const p = packet(layout.id, layout.size);
  p.writeUInt32LE(id, 2);
  p.writeUInt16LE(180, 6);
  if (options) {
    p.writeUInt16LE(1, 8); p.writeUInt16LE(2, 10); p.writeUInt16LE(4, 12);
    p.writeUInt16LE(8, layout.options);
  }
  p.writeUInt16LE(job, 14);
  p.writeUInt16LE(13, 16); p.writeUInt16LE(101, 18);
  for (const [field, value] of Object.entries({ bottom: 202, shield: 303, top: 404, mid: 505, color: 17, clothes: 606 }))
    p.writeUInt16LE(value, layout[field]);
  if (layout.tick) p.writeUInt32LE(0x12345678, layout.tick);
  if (layout.hp) { p.writeUInt32LE(70000, layout.hp); p.writeUInt32LE(90000, layout.hp + 4); }
  else { p.writeUInt32LE(0xdeadbeef, layout.coord - 12); } // guild, must never become HP
  p[layout.sex] = 0;
  const x = 300, y = 500, dx = 301, dy = 499;
  p[layout.coord] = x >> 2;
  p[layout.coord + 1] = ((x & 3) << 6) | (y >> 4);
  p[layout.coord + 2] = ((y & 15) << 4) | (layout.tick ? dx >> 6 : direction);
  if (layout.tick) {
    p[layout.coord + 3] = ((dx & 63) << 2) | (dy >> 8);
    p[layout.coord + 4] = dy & 255;
  }
  return p;
}
