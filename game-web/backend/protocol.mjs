import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read the table belonging to the pinned Mana submodule. Keeping one source of
// packet lengths prevents the browser gateway drifting from the native client.
export function loadPacketLengths(repoRoot) {
  const base = join(repoRoot, 'sources/mana/src/net/tmwa');
  const definitions = readFileSync(join(base, 'protocol.h'), 'utf8');
  const network = readFileSync(join(base, 'network.cpp'), 'utf8');
  const ids = new Map();
  for (const [, name, id] of definitions.matchAll(/\b([CS]MSG_[A-Z0-9_]+)\s*=\s*(0x[0-9a-fA-F]+)/g))
    ids.set(name, Number.parseInt(id, 16));
  const lengths = new Map();
  for (const [, name, size] of network.matchAll(/\{\s*([CS]MSG_[A-Z0-9_]+)\s*,\s*(VAR|\d+)\s*,/g)) {
    const id = ids.get(name);
    if (id !== undefined) lengths.set(id, size === 'VAR' ? -1 : Number(size));
  }
  if (lengths.size < 150 || lengths.get(0x0069) !== -1 || lengths.get(0x0073) !== 11)
    throw new Error('Tabla de paquetes de Mana incompleta; ejecuta ./scripts/preparar-fuentes.sh');
  return lengths;
}

export class PacketDecoder {
  constructor(lengths, onPacket, preludeBytes = 0) {
    this.lengths = lengths;
    this.onPacket = onPacket;
    this.preludeBytes = preludeBytes;
    this.pending = Buffer.alloc(0);
  }

  push(chunk) {
    if (this.preludeBytes) {
      const skip = Math.min(chunk.length, this.preludeBytes);
      this.preludeBytes -= skip;
      chunk = chunk.subarray(skip);
    }
    if (!chunk.length) return;
    this.pending = Buffer.concat([this.pending, chunk]);
    if (this.pending.length > 512 * 1024) throw new Error('Respuesta del servidor demasiado grande');
    while (this.pending.length >= 2) {
      const id = this.pending.readUInt16LE(0);
      const fixedLength = this.lengths.get(id);
      if (fixedLength === undefined) throw new Error(`Paquete TMWA no reconocido: 0x${id.toString(16)}`);
      if (fixedLength === -1 && this.pending.length < 4) return;
      const length = fixedLength === -1 ? this.pending.readUInt16LE(2) : fixedLength;
      if (length < (fixedLength === -1 ? 4 : 2) || length > 65535)
        throw new Error(`Longitud inválida del paquete 0x${id.toString(16)}`);
      if (this.pending.length < length) return;
      const packet = this.pending.subarray(0, length);
      this.pending = this.pending.subarray(length);
      this.onPacket(id, packet);
    }
  }
}

export function packet(id, length) {
  const out = Buffer.alloc(length);
  out.writeUInt16LE(id, 0);
  return out;
}

export function fixedString(out, value, start, length) {
  Buffer.from(value, 'utf8').copy(out, start, 0, length);
}

export function textAt(buf, start, length) {
  return buf.subarray(start, start + length).toString('utf8').split('\0')[0];
}

export function positionAt(buf, offset) {
  return {
    x: ((buf[offset] << 8) | (buf[offset + 1] & 0xc0)) >> 6,
    y: (((buf[offset + 1] & 0x3f) << 8) | (buf[offset + 2] & 0xf0)) >> 4,
    direction: buf[offset + 2] & 0x0f,
  };
}

export function destinationAt(buf, offset) {
  return {
    x: ((buf[offset + 2] & 0x0f) << 6) | (buf[offset + 3] >> 2),
    y: ((buf[offset + 3] & 0x03) << 8) | buf[offset + 4],
  };
}

export function destination(x, y, direction = 0) {
  const out = packet(0x0085, 5);
  out[2] = (x >> 2) & 0xff;
  out[3] = ((x & 3) << 6) | ((y >> 4) & 0x3f);
  out[4] = ((y & 15) << 4) | (direction & 15);
  return out;
}

export function validInt(value, min = 0, max = 65535) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Número fuera de rango');
  return value;
}
