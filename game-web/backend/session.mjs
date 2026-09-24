import net from 'node:net';
import { PacketDecoder, destination, destinationAt, fixedString, packet, positionAt, textAt, validInt } from './protocol.mjs';

const idPacket = (id, target, size = 6) => {
  const out = packet(id, size);
  out.writeUInt32LE(target, 2);
  return out;
};
const label = message => String(message).slice(0, 180);
const worldMap = name => name.replace(/\.(gat|tmx)$/i, '');
const loginErrors = {
  0: 'La cuenta no existe. Usa Crear cuenta para registrarte.',
  1: 'La contraseña es incorrecta.',
  2: 'La cuenta ha caducado.',
  3: 'El servidor rechazó el acceso.',
  4: 'La cuenta está bloqueada permanentemente.',
  5: 'El servidor requiere una versión más reciente del cliente.',
  6: 'La cuenta está bloqueada temporalmente.',
  7: 'El servidor está lleno. Inténtalo más tarde.',
  9: 'Ese nombre de usuario ya está registrado.',
  99: 'La cuenta fue eliminada.',
};
const connectionErrors = {
  0: 'El servidor rechazó la autenticación.',
  1: 'No hay un servidor de personajes disponible. Comprueba ./scripts/servidor.sh.',
  2: 'La cuenta ya está conectada o hubo demasiados intentos. Espera antes de reintentar.',
  3: 'El servidor rechazó la velocidad de las acciones del cliente.',
  8: 'La cuenta inició sesión en otro cliente.',
};

export class GameSession {
  constructor(ws, lengths, ports = { login: 6901, char: 6122, map: 5122 }, { replyTimeoutMs = 15000 } = {}) {
    this.ws = ws;
    this.lengths = lengths;
    this.ports = ports;
    this.phase = 'idle';
    this.socket = null;
    this.token = null;
    this.character = null;
    this.map = '';
    this.npc = 0;
    this.npcMode = null;
    this.walkStepMs = 150; // TMWA DEFAULT_WALK_SPEED: delay per orthogonal tile.
    this.inventory = new Map();
    this.names = new Set();
    this.replyTimeoutMs = replyTimeoutMs;
    this.replyTimer = null;
  }

  emit(data) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(data));
  }

  close() {
    this.clearReplyTimeout();
    this.credentials = null;
    this.phase = 'closed';
    this.socket?.destroy();
    this.socket = null;
  }

  clearReplyTimeout() {
    clearTimeout(this.replyTimer);
    this.replyTimer = null;
  }

  waitForReply() {
    this.clearReplyTimeout();
    this.replyTimer = setTimeout(() => {
      this.fail('El servidor tardó demasiado en responder. Comprueba ./scripts/servidor.sh e inténtalo de nuevo.');
    }, this.replyTimeoutMs);
    this.replyTimer.unref();
  }

  fail(message) {
    this.emit({ type: 'error', message });
    this.close();
  }

  connect(phase) {
    this.socket?.destroy();
    this.phase = phase;
    const socket = net.createConnection({ host: '127.0.0.1', port: this.ports[phase] });
    this.socket = socket;
    this.waitForReply();
    const decoder = new PacketDecoder(this.lengths, (id, p) => this.receive(id, p), phase === 'login' ? 0 : 4);
    socket.on('connect', () => {
      if (socket !== this.socket) return;
      if (phase === 'login') {
        this.send(packet(0x7530, 2));
      } else if (phase === 'char') {
        const p = packet(0x0065, 17);
        p.writeUInt32LE(this.token.account, 2);
        p.writeUInt32LE(this.token.session1, 6);
        p.writeUInt32LE(this.token.session2, 10);
        p.writeUInt16LE(1, 14); // Mana's CLIENT_PROTOCOL_VERSION
        p[16] = this.token.sex;
        this.send(p);
      } else {
        const p = packet(0x0072, 19);
        p.writeUInt32LE(this.token.account, 2);
        p.writeUInt32LE(this.character.id, 6);
        p.writeUInt32LE(this.token.session1, 10);
        p.writeUInt32LE(this.token.session2, 14);
        p[18] = this.token.sex;
        this.send(p);
      }
      this.emit({ type: 'status', phase, message: 'Conectado al servidor.' });
    });
    socket.on('data', data => {
      if (socket !== this.socket) return;
      try { decoder.push(data); } catch (error) {
        this.fail(`Protocolo incompatible: ${label(error.message)}`);
      }
    });
    socket.on('error', error => {
      if (socket === this.socket) this.fail(`No se pudo conectar a ${phase}: ${label(error.message)}`);
    });
    socket.on('close', () => {
      if (socket !== this.socket) return;
      this.clearReplyTimeout();
      this.credentials = null;
      this.socket = null;
      if (this.phase !== 'closed') this.emit({ type: 'status', phase: 'disconnected', message: 'El servidor cerró la conexión.' });
    });
  }

  send(data, onWritten) {
    if (!this.socket || !this.socket.writable) throw new Error('No hay conexión con TMWA');
    this.socket.write(data, onWritten);
  }

  command(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Solicitud inválida');
    const { type } = raw;
    if (type === 'login') {
      if (this.phase !== 'idle' && this.phase !== 'closed') throw new Error('Ya existe una sesión');
      const { username, password, register, sex } = raw;
      if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{4,21}$/.test(username)) throw new Error('Usuario inválido (4 a 21 caracteres)');
      if (typeof password !== 'string' || Buffer.byteLength(password) < 4 || Buffer.byteLength(password) > 23 || /[\x00-\x1f]/.test(password)) throw new Error('Clave inválida (4 a 23 bytes)');
      this.credentials = { username: username + (register ? (sex === 'F' ? '_F' : '_M') : ''), password };
      this.connect('login');
      return;
    }
    if (type === 'choose' && this.phase === 'char') {
      const slot = validInt(raw.slot, 0, 8);
      const char = this.characters?.find(c => c.slot === slot);
      if (!char) throw new Error('Selecciona un personaje de la lista');
      this.character = char;
      const p = packet(0x0066, 3);
      p[2] = slot;
      this.send(p);
      this.waitForReply();
      return;
    }
    if (type === 'create' && this.phase === 'char') {
      if (typeof raw.name !== 'string' || !/^[\p{L}0-9 _-]{4,23}$/u.test(raw.name) || Buffer.byteLength(raw.name) > 23)
        throw new Error('Nombre de personaje inválido (4 a 23 bytes)');
      const slot = validInt(raw.slot, 0, 8);
      const p = packet(0x0067, 37);
      fixedString(p, raw.name, 2, 24);
      p.fill(5, 26, 32); // total_stat_sum=30, char_athena.conf
      p[32] = slot;
      p.writeUInt16LE(0, 33);
      p.writeUInt16LE(1, 35);
      this.send(p);
      this.waitForReply();
      return;
    }
    if (this.phase !== 'map') throw new Error('Entra primero al juego');
    if (type === 'loaded') { this.send(packet(0x007d, 2)); return; }
    if (type === 'walk') {
      const x = validInt(raw.x, 0, 1023), y = validInt(raw.y, 0, 1023);
      this.send(destination(x, y));
      return;
    }
    if (type === 'say') {
      if (typeof raw.text !== 'string' || !raw.text.trim() || Buffer.byteLength(raw.text) > 220 || raw.text.includes('\0')) throw new Error('Mensaje inválido');
      const body = Buffer.from(raw.text.trim(), 'utf8');
      const p = packet(0x008c, 5 + body.length);
      p.writeUInt16LE(p.length, 2);
      body.copy(p, 4);
      this.send(p);
      return;
    }
    if (type === 'stopAttack') { this.send(packet(0x0118, 2)); return; }
    if (type === 'talk' || type === 'attack' || type === 'pickup') {
      const id = validInt(raw.id, 1, 0xffffffff);
      if (type === 'talk') {
        this.npc = id;
        this.send(idPacket(0x0090, id, 7));
      } else if (type === 'attack') {
        const p = idPacket(0x0089, id, 7);
        p[6] = 7; // continuous attack
        this.send(p);
      } else this.send(idPacket(0x009f, id));
      return;
    }
    if (type === 'next' || type === 'closeNpc' || type === 'choice' || type === 'npcInput') {
      const id = validInt(raw.id, 1, 0xffffffff);
      if (id !== this.npc) throw new Error('Diálogo de NPC no activo');
      if (type === 'npcInput') {
        if (this.npcInput === 'number') {
          const p = idPacket(0x0143, id, 10);
          p.writeInt32LE(validInt(Number(raw.value), 0, 0x7fffffff), 6);
          this.send(p);
        } else if (this.npcInput === 'text') {
          if (typeof raw.value !== 'string' || Buffer.byteLength(raw.value) > 200 || raw.value.includes('\0')) throw new Error('Respuesta inválida');
          const body = Buffer.from(raw.value, 'utf8');
          const p = idPacket(0x01d5, id, 9 + body.length);
          p.writeUInt16LE(p.length, 2);
          p.writeUInt32LE(id, 4);
          body.copy(p, 8);
          this.send(p);
        } else throw new Error('NPC no solicita entrada');
        this.npcInput = null;
      } else if (type === 'choice' || type === 'closeNpc' && this.npcMode === 'choice') {
        const p = idPacket(0x00b8, id, 7);
        // TMWA cancels a menu only with entry 255, not with the close ACK.
        p[6] = type === 'closeNpc' ? 255 : validInt(raw.index, 1, 254);
        this.send(p);
      } else {
        if (type === 'closeNpc' && this.npcMode !== 'close') throw new Error('Completa la respuesta del NPC antes de cerrar.');
        this.send(idPacket(type === 'next' ? 0x00b9 : 0x0146, id));
      }
      this.npcMode = null;
      if (type === 'closeNpc') this.npc = 0;
      return;
    }
    if (type === 'use' || type === 'equip' || type === 'unequip') {
      const slot = validInt(raw.slot, 0, 65533) + 2;
      const p = packet(type === 'use' ? 0x00a7 : type === 'equip' ? 0x00a9 : 0x00ab,
        type === 'use' ? 8 : type === 'equip' ? 6 : 4);
      p.writeUInt16LE(slot, 2);
      if (type === 'use') p.writeUInt32LE(this.inventory.get(slot - 2)?.id ?? 0, 4);
      if (type === 'equip') p.writeUInt16LE(0, 4); // server chooses equip slot
      this.send(p);
      return;
    }
    throw new Error('Acción no disponible');
  }

  receive(id, p) {
    if (id === 0x7531 && this.phase === 'login') {
      const { username, password } = this.credentials;
      const auth = packet(0x0064, 55);
      auth.writeUInt32LE(8, 2);
      fixedString(auth, username, 6, 24);
      fixedString(auth, password, 30, 24);
      auth[54] = 3;
      this.credentials = null;
      this.send(auth, () => auth.fill(0));
      return;
    }
    if (id === 0x006a) { this.fail(loginErrors[p[2]] ?? `Acceso rechazado (código ${p[2]}).`); return; }
    if (id === 0x0081) { this.fail(connectionErrors[p[2]] ?? `Conexión rechazada (código ${p[2]}).`); return; }
    if (id === 0x0069 && this.phase === 'login') {
      if (p.length < 79 || (p.length - 47) % 32) throw new Error('Lista de mundos inválida');
      this.token = { session1: p.readUInt32LE(4), account: p.readUInt32LE(8), session2: p.readUInt32LE(12), sex: p[46] };
      this.connect('char');
      return;
    }
    if (id === 0x006c) { this.fail(`El servidor de personajes rechazó el acceso (${p[2]}).`); return; }
    if (id === 0x006b && this.phase === 'char') {
      if ((p.length - 24) % 106) throw new Error('Lista de personajes inválida');
      this.clearReplyTimeout();
      this.characters = [];
      for (let i = 24; i + 106 <= p.length; i += 106) this.characters.push({
        id: p.readUInt32LE(i), name: textAt(p, i + 74, 24), slot: p[i + 104],
        level: p.readUInt16LE(i + 58), hp: p.readUInt16LE(i + 42), maxHp: p.readUInt16LE(i + 44), sex: p[i + 105],
      });
      this.emit({ type: 'characters', characters: this.characters });
      return;
    }
    if (id === 0x006d && this.phase === 'char') {
      this.clearReplyTimeout();
      const i = 2;
      const created = { id: p.readUInt32LE(i), name: textAt(p, i + 74, 24), slot: p[i + 104],
        level: p.readUInt16LE(i + 58), hp: p.readUInt16LE(i + 42), maxHp: p.readUInt16LE(i + 44), sex: p[i + 105] };
      this.characters.push(created);
      this.emit({ type: 'characters', characters: this.characters });
      return;
    }
    if (id === 0x006e) { this.clearReplyTimeout(); this.emit({ type: 'error', message: 'No se pudo crear el personaje. Prueba con otro nombre.' }); return; }
    if (id === 0x0071 && this.phase === 'char') {
      if (p.readUInt32LE(2) !== this.character?.id) throw new Error('Personaje inesperado');
      this.map = worldMap(textAt(p, 6, 16));
      this.connect('map');
      return;
    }
    if (id === 0x0073 && this.phase === 'map') {
      this.clearReplyTimeout();
      const pos = positionAt(p, 6);
      this.emit({ type: 'world', map: this.map, x: pos.x, y: pos.y, id: this.token.account, name: this.character.name });
      return;
    }
    if (id === 0x0091 && this.phase === 'map') {
      this.map = worldMap(textAt(p, 2, 16));
      this.emit({ type: 'world', map: this.map, x: p.readUInt16LE(18), y: p.readUInt16LE(20), id: this.token.account, name: this.character.name });
      return;
    }
    if (id === 0x00b0 && p.readUInt16LE(2) === 0) {
      const stepMs = p.readUInt32LE(4);
      if (stepMs > 0 && stepMs <= 60000) {
        this.walkStepMs = stepMs;
        this.emit({ type: 'walkSpeed', stepMs });
      }
      return;
    }
    if (id === 0x0087 && this.phase === 'map') {
      const { x, y } = positionAt(p, 6);
      this.emit({ type: 'walk', from: { x, y }, to: destinationAt(p, 6), stepMs: this.walkStepMs });
      return;
    }
    if (id === 0x0088 && this.phase === 'map') {
      const entityId = p.readUInt32LE(2);
      this.emit({ type: entityId === this.token.account ? 'position' : 'entity',
        id: entityId, x: p.readUInt16LE(6), y: p.readUInt16LE(8) });
      return;
    }
    if (id === 0x0078 || id === 0x007b || id === 0x01d8 || id === 0x01d9 || id === 0x01da) {
      const entityId = p.readUInt32LE(2);
      const job = p.readUInt16LE(14);
      const pair = id === 0x007b || id === 0x01da;
      const coords = pair ? destinationAt(p, 50)
        : positionAt(p, 46);
      const kind = job >= 1000 ? 'monster' : job >= 40 ? 'npc' : 'player';
      this.emit({ type: 'entity', id: entityId, kind, job, ...coords,
        ...(id === 0x0078 || id === 0x007b ? { hp: p.readUInt32LE(id === 0x007b ? 36 : 32), maxHp: p.readUInt32LE(id === 0x007b ? 40 : 36) } : {}) });
      if ((kind === 'player' || kind === 'npc') && !this.names.has(entityId)) {
        this.names.add(entityId);
        this.send(idPacket(0x0094, entityId));
      }
      return;
    }
    if (id === 0x0080) { this.emit({ type: 'remove', id: p.readUInt32LE(2) }); return; }
    if (id === 0x0095) { this.emit({ type: 'entity', id: p.readUInt32LE(2), name: textAt(p, 6, 24) }); return; }
    if (id === 0x009d || id === 0x009e) {
      this.emit({ type: 'entity', kind: 'item', id: p.readUInt32LE(2), job: p.readUInt16LE(6), x: p.readUInt16LE(9), y: p.readUInt16LE(11) }); return;
    }
    if (id === 0x00a1) { this.emit({ type: 'remove', id: p.readUInt32LE(2) }); return; }
    if (id === 0x008d || id === 0x008e) {
      const from = id === 0x008d ? p.readUInt32LE(4) : this.token.account;
      this.emit({ type: 'chat', id: from, from: id === 0x008e ? this.character.name : '',
        text: textAt(p, id === 0x008d ? 8 : 4, p.length - (id === 0x008d ? 8 : 4)) }); return;
    }
    if (id === 0x00b4 || id === 0x00b7 || id === 0x00b5 || id === 0x00b6) {
      const npcId = p.readUInt32LE(id === 0x00b4 || id === 0x00b7 ? 4 : 2);
      this.npc = npcId;
      this.npcMode = id === 0x00b7 ? 'choice' : id === 0x00b6 ? 'close' : id === 0x00b5 ? 'next' : null;
      const text = id === 0x00b4 || id === 0x00b7 ? textAt(p, 8, p.length - 8) : undefined;
      this.emit({ type: 'dialog', id: npcId, ...(id === 0x00b7 ? { choices: text.split(':') } : {}),
        ...(id === 0x00b4 ? { text } : {}), next: id === 0x00b5, close: id === 0x00b6 });
      return;
    }
    if (id === 0x0142 || id === 0x01d4) {
      this.npc = p.readUInt32LE(2);
      this.npcInput = id === 0x0142 ? 'number' : 'text';
      this.npcMode = this.npcInput;
      this.emit({ type: 'dialog', id: this.npc, input: this.npcInput });
      return;
    }
    if (id === 0x0212) {
      const npcId = p.readUInt32LE(2), command = p.readUInt16LE(6);
      if (command === 5) {
        // close2 without preceding text also waits for this ACK.
        this.send(idPacket(0x0146, npcId));
        if (this.npc === npcId) { this.npc = 0; this.npcMode = null; this.npcInput = null; }
        this.emit({ type: 'dialog', id: npcId, closed: true });
      } else if (command === 9) this.emit({ type: 'dialog', id: npcId, clear: true });
      return;
    }
    if (id === 0x008a) { this.emit({ type: 'hit', source: p.readUInt32LE(2), target: p.readUInt32LE(6), damage: p.readUInt16LE(22) }); return; }
    if (id === 0x01ee || id === 0x00a4) {
      const stride = id === 0x01ee ? 18 : 20;
      if ((p.length - 4) % stride) throw new Error('Inventario inválido');
      if (id === 0x01ee) this.inventory.clear();
      for (let i = 4; i + stride <= p.length; i += stride) {
        const slot = p.readUInt16LE(i) - 2;
        this.inventory.set(slot, { slot, id: p.readUInt16LE(i + 2), amount: id === 0x01ee ? p.readUInt16LE(i + 6) : 1,
          equipped: id === 0x00a4 && p.readUInt16LE(i + 8) !== 0 });
      }
      this.emit({ type: 'inventory', items: [...this.inventory.values()] });
      return;
    }
    if (id === 0x00aa || id === 0x00ac) {
      const slot = p.readUInt16LE(2) - 2, current = this.inventory.get(slot);
      if (p[6] && current) {
        current.equipped = id === 0x00aa;
        this.emit({ type: 'inventory', items: [...this.inventory.values()] });
      }
      return;
    }
    if (id === 0x00a0 && !p[22]) {
      const slot = p.readUInt16LE(2) - 2, current = this.inventory.get(slot);
      this.inventory.set(slot, { slot, id: p.readUInt16LE(6), amount: (current?.amount || 0) + p.readUInt16LE(4) });
      this.emit({ type: 'inventory', items: [...this.inventory.values()] }); return;
    }
    if (id === 0x00af) {
      const slot = p.readUInt16LE(2) - 2, current = this.inventory.get(slot);
      if (current) { current.amount -= p.readUInt16LE(4); if (current.amount <= 0) this.inventory.delete(slot); }
      this.emit({ type: 'inventory', items: [...this.inventory.values()] });
    }
  }
}
