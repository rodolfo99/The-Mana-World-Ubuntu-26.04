import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PacketDecoder, loadPacketLengths, packet } from '../backend/protocol.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const lengths = loadPacketLengths(repoRoot);

test('the pinned native-client table frames fixed and variable TMWA packets', () => {
  assert.equal(lengths.get(0x0069), -1);
  assert.equal(lengths.get(0x0073), 11);
  assert.equal(lengths.get(0x01ee), -1);
  const received = [];
  const decoder = new PacketDecoder(lengths, (id, bytes) => received.push([id, Buffer.from(bytes)]), 4);
  const variable = packet(0x0069, 79);
  variable.writeUInt16LE(variable.length, 2);
  variable.writeUInt32LE(0x12345678, 8);
  const fixed = packet(0x0073, 11);
  fixed[6] = 0x45;

  // TCP can split the four-byte prelude, packet ID, packet length, or payload;
  // it can also coalesce the tail of one packet with the next.
  decoder.push(Buffer.from([0xde]));
  decoder.push(Buffer.from([0xad, 0xbe]));
  decoder.push(Buffer.concat([Buffer.from([0xef]), variable.subarray(0, 1)]));
  assert.equal(received.length, 0);
  decoder.push(variable.subarray(1, 3));
  assert.equal(received.length, 0);
  decoder.push(variable.subarray(3, 37));
  assert.equal(received.length, 0);
  decoder.push(Buffer.concat([variable.subarray(37), fixed]));
  assert.deepEqual(received.map(([id]) => id), [0x0069, 0x0073]);
  assert.deepEqual(received[0][1], variable);
  assert.deepEqual(received[1][1], fixed);
});

test('unknown packet and malformed variable length fail explicitly', () => {
  assert.throws(() => new PacketDecoder(lengths, () => {}).push(Buffer.from([0xff, 0x6f])), /no reconocido/);
  const decoder = new PacketDecoder(lengths, () => {});
  decoder.push(Buffer.from([0x69, 0x00, 0x03]));
  assert.throws(() => decoder.push(Buffer.from([0x00])), /Longitud inválida/);
});
