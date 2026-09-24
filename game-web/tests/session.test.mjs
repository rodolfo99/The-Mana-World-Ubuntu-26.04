import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { GameSession } from '../backend/session.mjs';
import { loadPacketLengths, packet } from '../backend/protocol.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const lengths = loadPacketLengths(repoRoot);
const timeoutMs = 4000;

class SocketReader {
  #pending = Buffer.alloc(0);
  #waiters = [];
  constructor(socket) {
    socket.on('data', chunk => {
      this.#pending = Buffer.concat([this.#pending, chunk]);
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }
  async bytes(count) {
    while (this.#pending.length < count) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Esperaba ${count} bytes del cliente`)), timeoutMs);
        this.#waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    const value = this.#pending.subarray(0, count);
    this.#pending = this.#pending.subarray(count);
    return value;
  }
  async variable() {
    const head = await this.bytes(4);
    const length = head.readUInt16LE(2);
    assert.ok(length >= 4 && length <= 65535);
    return Buffer.concat([head, await this.bytes(length - 4)]);
  }
}

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  messages = [];
  send(json) {
    const message = JSON.parse(json);
    this.messages.push(message);
    this.emit('message', message);
  }
  wait(type, match = () => true) {
    const found = this.messages.find(value => value.type === type && match(value));
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.off('message', onMessage); reject(new Error(`Esperaba mensaje ${type}`)); }, timeoutMs);
      const onMessage = value => {
        if (value.type !== type || !match(value)) return;
        clearTimeout(timer);
        this.off('message', onMessage);
        resolve(value);
      };
      this.on('message', onMessage);
    });
  }
}

async function fakeServer(handler, pendingTasks, sockets) {
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    pendingTasks.push(handler(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function fixedText(buf, offset, text) { buf.write(text, offset, 'utf8'); }

function pos1(buf, offset, x, y, direction = 0) {
  buf[offset] = x >> 2;
  buf[offset + 1] = ((x & 3) << 6) | (y >> 4);
  buf[offset + 2] = ((y & 15) << 4) | direction;
}

function pos2(buf, offset, srcX, srcY, dstX, dstY) {
  pos1(buf, offset, srcX, srcY);
  buf[offset + 2] |= dstX >> 8;
  buf[offset + 3] = ((dstX & 255) << 2) | (dstY >> 8);
  buf[offset + 4] = dstY & 255;
}

for (const scenario of [
  { name: 'unknown account', id: 0x006a, size: 23, code: 0, expected: /La cuenta no existe/ },
  { name: 'wrong password', id: 0x006a, size: 23, code: 1, expected: /contraseña es incorrecta/ },
  { name: 'no character server', id: 0x0081, size: 3, code: 1, expected: /No hay un servidor de personajes/ },
  { name: 'already logged in', id: 0x0081, size: 3, code: 2, expected: /cuenta ya está conectada/ },
  { name: 'unresponsive login server', expected: /tardó demasiado/ },
]) {
  test(`login failure releases the session: ${scenario.name}`, { timeout: 5000 }, async t => {
    const tasks = [], sockets = new Set();
    const login = await fakeServer(async socket => {
      const reader = new SocketReader(socket);
      await reader.bytes(2);
      socket.write(packet(0x7531, 10));
      await reader.bytes(55);
      if (scenario.id) {
        const reply = packet(scenario.id, scenario.size);
        reply[2] = scenario.code;
        socket.write(reply);
      }
    }, tasks, sockets);
    const ws = new FakeWebSocket();
    const session = new GameSession(ws, lengths, { login: login.address().port }, { replyTimeoutMs: 250 });
    t.after(async () => {
      session.close();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => login.close(resolve));
    });
    session.command({ type: 'login', username: 'tester', password: 'secret' });
    assert.match((await ws.wait('error')).message, scenario.expected);
    assert.equal(session.phase, 'closed');
    assert.equal(session.credentials, null);
    assert.equal(session.replyTimer, null);
    await Promise.all(tasks);
  });
}

test('real TCP login, registration, character creation, map, movement and play commands', { timeout: 15000 }, async t => {
  const tasks = [], sockets = new Set();
  let walkResponse;
  let mapPort;
  const map = await fakeServer(async socket => {
    const reader = new SocketReader(socket);
    const enter = await reader.bytes(19);
    assert.equal(enter.readUInt16LE(0), 0x0072);
    assert.equal(enter.readUInt32LE(2), 42);
    assert.equal(enter.readUInt32LE(6), 1001);
    assert.equal(enter.readUInt32LE(10), 111);
    assert.equal(enter.readUInt32LE(14), 222);
    assert.equal(enter[18], 1);
    const start = packet(0x0073, 11);
    pos1(start, 6, 10, 20);
    socket.write(Buffer.from([0xde, 0xad]));
    socket.write(Buffer.concat([Buffer.from([0xbe, 0xef]), start.subarray(0, 4)]));
    socket.write(start.subarray(4));

    assert.deepEqual(await reader.bytes(2), packet(0x007d, 2));
    const mob = packet(0x0078, 54);
    mob.writeUInt32LE(5100, 2);
    mob.writeUInt16LE(1002, 14);
    mob.writeUInt32LE(36, 32);
    mob.writeUInt32LE(40, 36);
    pos1(mob, 46, 11, 20);
    const npc = packet(0x0078, 54);
    npc.writeUInt32LE(5200, 2);
    npc.writeUInt16LE(45, 14);
    pos1(npc, 46, 12, 20);
    const inventory = packet(0x01ee, 22);
    inventory.writeUInt16LE(inventory.length, 2);
    inventory.writeUInt16LE(2, 4); // first wire slot; UI slot 0
    inventory.writeUInt16LE(501, 6);
    inventory.writeUInt16LE(3, 10);
    const equipment = packet(0x00a4, 24);
    equipment.writeUInt16LE(equipment.length, 2);
    equipment.writeUInt16LE(3, 4); // UI slot 1
    equipment.writeUInt16LE(600, 6);
    equipment.writeUInt16LE(0x0010, 10); // equippable body slot
    equipment.writeUInt16LE(0, 12); // actually unequipped
    socket.write(Buffer.concat([mob, npc, inventory, equipment]));

    const walk = await reader.bytes(5);
    assert.equal(walk.readUInt16LE(0), 0x0085);
    assert.equal(((walk[2] << 8) | (walk[3] & 0xc0)) >> 6, 12);
    assert.equal((((walk[3] & 63) << 8) | (walk[4] & 0xf0)) >> 4, 21);
    const walking = packet(0x0087, 12);
    pos2(walking, 6, 10, 20, 12, 21);
    socket.write(walking);

    const chat = await reader.variable();
    assert.equal(chat.readUInt16LE(0), 0x008c);
    assert.equal(chat.subarray(4).toString('utf8').replace(/\0$/, ''), 'Hola, mundo');
    assert.equal(chat.at(-1), 0);
    const echo = packet(0x008e, 9);
    echo.writeUInt16LE(9, 2);
    fixedText(echo, 4, 'Hola');
    socket.write(echo);

    const talk = await reader.bytes(7);
    assert.equal(talk.readUInt16LE(0), 0x0090);
    assert.equal(talk.readUInt32LE(2), 5200);
    const dialog = packet(0x00b4, 13);
    dialog.writeUInt16LE(dialog.length, 2);
    dialog.writeUInt32LE(5200, 4);
    fixedText(dialog, 8, 'Hola');
    socket.write(dialog);
    const next = packet(0x00b5, 6);
    next.writeUInt32LE(5200, 2);
    socket.write(next);
    const nextRequest = await reader.bytes(6);
    assert.equal(nextRequest.readUInt16LE(0), 0x00b9);
    assert.equal(nextRequest.readUInt32LE(2), 5200);
    const choices = packet(0x00b7, 16);
    choices.writeUInt16LE(choices.length, 2);
    choices.writeUInt32LE(5200, 4);
    fixedText(choices, 8, 'Sí::No:');
    socket.write(choices);
    const choice = await reader.bytes(7);
    assert.equal(choice.readUInt16LE(0), 0x00b8);
    assert.equal(choice.readUInt32LE(2), 5200);
    assert.equal(choice[6], 3);
    const askNumber = packet(0x0142, 6);
    askNumber.writeUInt32LE(5200, 2);
    socket.write(askNumber);
    const number = await reader.bytes(10);
    assert.equal(number.readUInt16LE(0), 0x0143);
    assert.equal(number.readUInt32LE(2), 5200);
    assert.equal(number.readInt32LE(6), 7);
    const askText = packet(0x01d4, 6);
    askText.writeUInt32LE(5200, 2);
    socket.write(askText);
    const answer = await reader.variable();
    assert.equal(answer.readUInt16LE(0), 0x01d5);
    assert.equal(answer.readUInt32LE(4), 5200);
    assert.equal(answer.subarray(8).toString('utf8').replace(/\0$/, ''), 'sí');

    const attack = await reader.bytes(7);
    assert.equal(attack.readUInt16LE(0), 0x0089);
    assert.equal(attack.readUInt32LE(2), 5100);
    assert.equal(attack[6], 7);
    const hit = packet(0x008a, 29);
    hit.writeUInt32LE(42, 2);
    hit.writeUInt32LE(5100, 6);
    hit.writeUInt16LE(9, 22);
    socket.write(hit);

    const item = await reader.bytes(8);
    assert.equal(item.readUInt16LE(0), 0x00a7);
    assert.equal(item.readUInt16LE(2), 2);
    assert.equal(item.readUInt32LE(4), 501); // Mana sends the item ID, though the server ignores this field.
    const reduced = packet(0x00af, 6);
    reduced.writeUInt16LE(2, 2);
    reduced.writeUInt16LE(1, 4);
    socket.write(reduced);
    const equip = await reader.bytes(6);
    assert.equal(equip.readUInt16LE(0), 0x00a9);
    assert.equal(equip.readUInt16LE(2), 3);
    const equipResult = packet(0x00aa, 7);
    equipResult.writeUInt16LE(3, 2);
    equipResult.writeUInt16LE(0x0010, 4);
    equipResult[6] = 1;
    socket.write(equipResult);
    const unequip = await reader.bytes(4);
    assert.equal(unequip.readUInt16LE(0), 0x00ab);
    assert.equal(unequip.readUInt16LE(2), 3);
    const unequipResult = packet(0x00ac, 7);
    unequipResult.writeUInt16LE(3, 2);
    unequipResult.writeUInt16LE(0x0010, 4);
    unequipResult[6] = 1;
    socket.write(unequipResult);
    const warp = packet(0x0091, 22);
    fixedText(warp, 2, '002-1.gat');
    warp.writeUInt16LE(3, 18);
    warp.writeUInt16LE(4, 20);
    socket.write(warp);
    assert.deepEqual(await reader.bytes(2), packet(0x007d, 2));
    const dropped = packet(0x009d, 17);
    dropped.writeUInt32LE(5700, 2);
    dropped.writeUInt16LE(502, 6);
    dropped.writeUInt16LE(3, 9);
    dropped.writeUInt16LE(5, 11);
    socket.write(dropped);
    const pickup = await reader.bytes(6);
    assert.equal(pickup.readUInt16LE(0), 0x009f);
    assert.equal(pickup.readUInt32LE(2), 5700);
    walkResponse = walking;
  }, tasks, sockets);
  mapPort = map.address().port;

  const char = await fakeServer(async socket => {
    const reader = new SocketReader(socket);
    const connect = await reader.bytes(17);
    assert.equal(connect.readUInt16LE(0), 0x0065);
    assert.deepEqual([connect.readUInt32LE(2), connect.readUInt32LE(6), connect.readUInt32LE(10), connect.readUInt16LE(14), connect[16]], [42, 111, 222, 1, 1]);
    const emptyList = packet(0x006b, 24);
    emptyList.writeUInt16LE(24, 2);
    socket.write(Buffer.from([1, 2]));
    socket.write(Buffer.concat([Buffer.from([3, 4]), emptyList.subarray(0, 2)]));
    socket.write(emptyList.subarray(2));
    const create = await reader.bytes(37);
    assert.equal(create.readUInt16LE(0), 0x0067);
    assert.equal(create.subarray(2, 26).toString('utf8').split('\0')[0], 'Aria');
    assert.deepEqual([...create.subarray(26, 32)], [5, 5, 5, 5, 5, 5]);
    assert.equal(create[32], 1);
    const created = packet(0x006d, 108);
    created.writeUInt32LE(1001, 2);
    created.writeUInt16LE(5, 44);
    created.writeUInt16LE(10, 46);
    created.writeUInt16LE(1, 60);
    fixedText(created, 76, 'Aria');
    created[106] = 1;
    created[107] = 1;
    socket.write(created);
    const chosen = await reader.bytes(3);
    assert.equal(chosen.readUInt16LE(0), 0x0066);
    assert.equal(chosen[2], 1);
    const info = packet(0x0071, 28);
    info.writeUInt32LE(1001, 2);
    fixedText(info, 6, '001-1.gat');
    info.writeUInt16LE(mapPort, 26);
    socket.write(info);
  }, tasks, sockets);

  const login = await fakeServer(async socket => {
    const reader = new SocketReader(socket);
    assert.deepEqual(await reader.bytes(2), packet(0x7530, 2));
    socket.write(packet(0x7531, 10));
    const auth = await reader.bytes(55);
    assert.equal(auth.readUInt16LE(0), 0x0064);
    assert.equal(auth.readUInt32LE(2), 8);
    assert.equal(auth.subarray(6, 30).toString('utf8').split('\0')[0], 'rodo_F');
    assert.equal(auth.subarray(30, 54).toString('utf8').split('\0')[0], 'secret');
    assert.equal(auth[54], 3);
    const success = packet(0x0069, 79);
    success.writeUInt16LE(success.length, 2);
    success.writeUInt32LE(111, 4);
    success.writeUInt32LE(42, 8);
    success.writeUInt32LE(222, 12);
    success[46] = 1;
    success.writeUInt16LE(char.address().port, 51);
    fixedText(success, 53, 'Mundo de prueba');
    socket.write(success.subarray(0, 3));
    socket.write(success.subarray(3));
  }, tasks, sockets);

  const ws = new FakeWebSocket();
  const session = new GameSession(ws, lengths, { login: login.address().port, char: char.address().port, map: mapPort });
  t.after(async () => {
    session.close();
    for (const socket of sockets) socket.destroy();
    await Promise.all([map, char, login].map(server => new Promise(resolve => server.close(resolve))));
  });

  session.command({ type: 'login', username: 'rodo', password: 'secret', register: true, sex: 'F' });
  assert.deepEqual((await ws.wait('characters')).characters, []);
  session.command({ type: 'create', name: 'Aria', slot: 1 });
  assert.equal((await ws.wait('characters', m => m.characters.length === 1)).characters[0].id, 1001);
  session.command({ type: 'choose', slot: 1 });
  const world = await ws.wait('world');
  assert.deepEqual([world.map, world.x, world.y, world.name], ['001-1', 10, 20, 'Aria']);
  session.command({ type: 'loaded' });
  assert.deepEqual([(await ws.wait('entity', m => m.id === 5100)).kind, (await ws.wait('entity', m => m.id === 5200)).kind], ['monster', 'npc']);
  assert.equal((await ws.wait('inventory')).items[0].amount, 3);
  const initialEquipment = await ws.wait('inventory', m => m.items.some(item => item.id === 600));
  assert.equal(initialEquipment.items.find(item => item.id === 600).equipped, false);

  session.command({ type: 'walk', x: 12, y: 21 });
  const position = await ws.wait('position');
  session.command({ type: 'say', text: 'Hola, mundo' });
  assert.equal((await ws.wait('chat')).text, 'Hola');
  session.command({ type: 'talk', id: 5200 });
  assert.equal((await ws.wait('dialog', m => m.text === 'Hola')).text, 'Hola');
  await ws.wait('dialog', m => m.next === true);
  session.command({ type: 'next', id: 5200 });
  assert.deepEqual((await ws.wait('dialog', m => m.choices?.length === 4)).choices, ['Sí', '', 'No', '']);
  session.command({ type: 'choice', id: 5200, index: 3 });
  await ws.wait('dialog', m => m.input === 'number');
  session.command({ type: 'npcInput', id: 5200, value: 7 });
  await ws.wait('dialog', m => m.input === 'text');
  session.command({ type: 'npcInput', id: 5200, value: 'sí' });
  session.command({ type: 'attack', id: 5100 });
  assert.equal((await ws.wait('hit')).damage, 9);
  session.command({ type: 'use', slot: 0 });
  assert.equal((await ws.wait('inventory', m => m.items[0]?.amount === 2)).items[0].amount, 2);
  session.command({ type: 'equip', slot: 1 });
  const equipped = await ws.wait('inventory', m => m.items.find(item => item.id === 600)?.equipped === true);
  assert.equal(equipped.items.find(item => item.id === 600).equipped, true);
  session.command({ type: 'unequip', slot: 1 });
  const unequipped = await ws.wait('inventory', m => m.items.find(item => item.id === 600)?.equipped === false && m !== initialEquipment);
  assert.equal(unequipped.items.find(item => item.id === 600).equipped, false);
  const nextMap = await ws.wait('world', m => m.map === '002-1');
  assert.deepEqual([nextMap.x, nextMap.y], [3, 4]);
  session.command({ type: 'loaded' });
  assert.deepEqual([(await ws.wait('entity', m => m.id === 5700)).x, (await ws.wait('entity', m => m.id === 5700)).y], [3, 5]);
  session.command({ type: 'pickup', id: 5700 });
  await Promise.all(tasks);

  // 0x0087 contains both origin and destination; show the destination.
  assert.equal(walkResponse.readUInt16LE(0), 0x0087);
  assert.deepEqual([position.x, position.y], [12, 21]);
});
