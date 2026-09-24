/** Browser renderer for the pinned The Mana World TMX/TSX client data. */
import { Tile, WalkingMotion, walkingPath } from './movement';
export interface GameEntity {
  id: number;
  kind: 'player' | 'npc' | 'monster' | 'item';
  job?: number;
  x: number;
  y: number;
  name?: string;
  hp?: number;
  maxHp?: number;
}

interface TileFrame { tileid: number; duration: number }
interface Tileset {
  firstgid: number;
  width: number;
  height: number;
  spacing: number;
  margin: number;
  columns: number;
  count: number;
  image: HTMLImageElement;
  animations: Map<number, TileFrame[]>;
}
interface Layer {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  mask: number;
  gids: Uint32Array;
}
interface WorldMap {
  name: string;
  width: number;
  height: number;
  tw: number;
  th: number;
  tilesets: Tileset[];
  layers: Layer[];
  mask: number;
}
interface SpriteFrame { index: number; delay: number; ox: number; oy: number }
interface Sprite {
  image: HTMLImageElement;
  width: number;
  height: number;
  actions: Map<string, SpriteFrame[]>;
  pixels: Uint8ClampedArray;
}
interface Actor extends GameEntity { direction: 'up' | 'down' | 'left' | 'right' }
interface HitRegion {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  circle?: boolean;
  sprite?: Sprite;
  sx?: number;
  sy?: number;
}

const number = (value: string | null, fallback = 0): number => {
  const parsed = Number(value);
  return value === null || !Number.isFinite(parsed) ? fallback : parsed;
};

function xml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El XML de los recursos está dañado.');
  return doc;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se encontró ${url} (HTTP ${response.status}). Prepara los submódulos de datos del juego.`);
  return response.text();
}

async function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const picture = new Image();
    picture.onload = () => resolve(picture);
    picture.onerror = () => reject(new Error(`No se pudo cargar ${url}.`));
    picture.src = url;
  });
}

async function layerData(element: Element, expected: number): Promise<Uint32Array> {
  const data = element.querySelector(':scope > data');
  if (!data) return new Uint32Array(expected);
  let values: number[];
  if (data.getAttribute('encoding') === 'csv') {
    values = (data.textContent ?? '').split(',').map(v => v.trim()).filter(Boolean).map(Number);
  } else if (data.getAttribute('encoding') === 'base64') {
    const bytes = Uint8Array.from(atob((data.textContent ?? '').replace(/\s/g, '')), char => char.charCodeAt(0));
    const compression = data.getAttribute('compression');
    let buffer: ArrayBuffer;
    if (compression === 'gzip' || compression === 'zlib') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(compression === 'zlib' ? 'deflate' : 'gzip'));
      buffer = await new Response(stream).arrayBuffer();
    } else if (!compression) {
      buffer = bytes.buffer;
    } else {
      throw new Error(`Compresión de mapa no compatible: ${compression}`);
    }
    const view = new DataView(buffer);
    values = Array.from({ length: Math.floor(view.byteLength / 4) }, (_, i) => view.getUint32(i * 4, true));
  } else {
    values = Array.from(data.querySelectorAll(':scope > tile'), tile => number(tile.getAttribute('gid')));
  }
  if (values.length !== expected || values.some(v => !Number.isFinite(v))) {
    throw new Error(`La capa ${element.getAttribute('name')} no tiene ${expected} celdas válidas.`);
  }
  return Uint32Array.from(values);
}

async function loadMap(mapName: string): Promise<WorldMap> {
  const id = mapName.replace(/\.(gat|tmx)$/i, '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Nombre de mapa inválido.');
  const mapUrl = new URL(`/assets/maps/${id}.tmx`, location.href);
  const root = xml(await fetchText(mapUrl.href)).documentElement;
  const tilesets: Tileset[] = [];
  for (const element of Array.from(root.children).filter(child => child.localName === 'tileset')) {
    const source = element.getAttribute('source');
    const tilesetUrl = source ? new URL(source, mapUrl) : mapUrl;
    const ts = source ? xml(await fetchText(tilesetUrl.href)).documentElement : element;
    const tileImage = ts.querySelector(':scope > image');
    if (!tileImage?.getAttribute('source')) throw new Error(`Tileset sin imagen: ${tilesetUrl.href}`);
    const tw = number(ts.getAttribute('tilewidth'));
    const th = number(ts.getAttribute('tileheight'));
    const margin = number(ts.getAttribute('margin'));
    const spacing = number(ts.getAttribute('spacing'));
    const graphic = await image(new URL(tileImage.getAttribute('source')!, tilesetUrl).href);
    const columns = Math.floor((graphic.width - 2 * margin + spacing) / (tw + spacing));
    const rows = Math.floor((graphic.height - 2 * margin + spacing) / (th + spacing));
    if (tw < 1 || th < 1 || columns < 1 || rows < 1) throw new Error(`Tileset inválido: ${tilesetUrl.href}`);
    const animations = new Map<number, TileFrame[]>();
    ts.querySelectorAll(':scope > tile').forEach(tile => {
      const frames = Array.from(tile.querySelectorAll(':scope > animation > frame'), frame => ({
        tileid: number(frame.getAttribute('tileid')),
        duration: Math.max(1, number(frame.getAttribute('duration'), 100))
      }));
      if (frames.length) animations.set(number(tile.getAttribute('id')), frames);
    });
    tilesets.push({ firstgid: number(element.getAttribute('firstgid')), width: tw, height: th,
      spacing, margin, columns, count: columns * rows, image: graphic, animations });
  }
  tilesets.sort((a, b) => a.firstgid - b.firstgid);
  const layers: Layer[] = [];
  for (const child of Array.from(root.children).filter(child => child.localName === 'layer')) {
    const w = number(child.getAttribute('width'), number(root.getAttribute('width')));
    const h = number(child.getAttribute('height'), number(root.getAttribute('height')));
    const mask = number(child.querySelector(':scope > properties > property[name="Mask"]')?.getAttribute('value') ?? null, 1);
    layers.push({ name: child.getAttribute('name') ?? '', width: w, height: h,
      x: number(child.getAttribute('x')), y: number(child.getAttribute('y')), mask,
      gids: await layerData(child, w * h) });
  }
  return { name: root.querySelector(':scope > properties > property[name="name"]')?.getAttribute('value') ?? id,
    width: number(root.getAttribute('width')), height: number(root.getAttribute('height')),
    tw: number(root.getAttribute('tilewidth')), th: number(root.getAttribute('tileheight')),
    tilesets, layers, mask: 1 };
}

async function loadSprite(path: string): Promise<Sprite> {
  const root = xml(await fetchText(`/assets/graphics/sprites/${path}.xml`)).documentElement;
  const set = root.querySelector(':scope > imageset');
  if (!set) throw new Error(`Sprite ${path} sin imágenes.`);
  const source = set.getAttribute('src')?.split('|')[0];
  if (!source) throw new Error(`Sprite ${path} sin PNG.`);
  const graphic = await image(`/assets/${source}`);
  const sample = document.createElement('canvas');
  sample.width = graphic.width; sample.height = graphic.height;
  const sampleContext = sample.getContext('2d')!;
  sampleContext.drawImage(graphic, 0, 0);
  const pixels = sampleContext.getImageData(0, 0, graphic.width, graphic.height).data;
  const actions = new Map<string, SpriteFrame[]>();
  root.querySelectorAll(':scope > action').forEach(action => {
    action.querySelectorAll(':scope > animation').forEach(animation => {
      const frames: SpriteFrame[] = [];
      Array.from(animation.children).forEach(frame => {
        const delay = Math.max(1, number(frame.getAttribute('delay'), 100));
        const ox = number(frame.getAttribute('offsetX'));
        const oy = number(frame.getAttribute('offsetY'));
        if (frame.localName === 'frame') frames.push({ index: number(frame.getAttribute('index')), delay, ox, oy });
        if (frame.localName === 'sequence') {
          for (let index = number(frame.getAttribute('start')); index <= number(frame.getAttribute('end')); index++) {
            frames.push({ index, delay, ox, oy });
          }
        }
      });
      if (frames.length) actions.set(`${action.getAttribute('name')}:${animation.getAttribute('direction')}`, frames);
    });
  });
  return { image: graphic, width: number(set.getAttribute('width')),
    height: number(set.getAttribute('height')), actions, pixels };
}

export class WorldRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private frame = 0;
  private gameMap: WorldMap | null = null;
  private avatar: Sprite | null = null;
  private maggot: Sprite | null = null;
  private entities = new Map<number, Actor>();
  private self: Actor = { id: -1, kind: 'player', x: 22, y: 24, direction: 'down' };
  private selectedId: number | null = null;
  private readonly motion = new WalkingMotion();
  private loadSequence = 0;
  private attackingUntil = 0;
  private actionStart = 0;
  private cameraX = 0;
  private cameraY = 0;
  private cssWidth = 1;
  private cssHeight = 1;
  private hitRegions: HitRegion[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement, private readonly onLocation?: (tile: Tile) => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('El navegador no permite Canvas 2D.');
    this.ctx = ctx;
    // Showing the sidebar changes the canvas size without a window resize.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.frame = requestAnimationFrame(this.draw);
  }

  destroy(): void {
    this.loadSequence++;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResize);
  }

  async enter(mapName: string, x: number, y: number, id: number, name: string, mask = 1): Promise<string> {
    const sequence = ++this.loadSequence;
    this.gameMap = null;
    this.hitRegions = [];
    this.self = { id, kind: 'player', x, y, direction: 'down', name };
    this.motion.reset({ x, y });
    this.entities.clear();
    this.selectedId = null;
    const [map, avatar, maggot] = await Promise.all([
      loadMap(mapName), loadSprite('races/human-male').catch(() => null),
      loadSprite('monsters/maggot').catch(() => null)
    ]);
    if (sequence !== this.loadSequence) return map.name;
    map.mask = mask;
    this.avatar = avatar;
    this.maggot = maggot;
    this.gameMap = map;
    return map.name;
  }

  get name(): string { return this.gameMap?.name ?? ''; }
  get location(): Tile { return { x: Math.round(this.self.x), y: Math.round(this.self.y) }; }
  get target(): GameEntity | undefined { return this.selectedId === null ? undefined : this.entities.get(this.selectedId); }
  get isReady(): boolean { return !!this.gameMap; }

  setPosition(x: number, y: number): void {
    this.motion.reset({ x, y });
    this.updateSelf(performance.now());
  }

  walk(from: Tile, to: Tile, stepMs: number): boolean {
    const path = walkingPath(from, to, (x, y) => this.walkable(x, y));
    if (!path) {
      this.setPosition(from.x, from.y);
      return false;
    }
    const now = performance.now();
    this.motion.follow(path, stepMs, now);
    this.updateSelf(now);
    return true;
  }

  setWalkSpeed(stepMs: number): void {
    this.motion.changeSpeed(stepMs, performance.now());
  }

  private updateSelf(now: number): void {
    const previous = this.location;
    const point = this.motion.advance(now);
    this.self.direction = this.direction(this.self.x, this.self.y, point.x, point.y, this.self.direction);
    this.self.x = point.x; this.self.y = point.y;
    const tile = this.location;
    if (tile.x !== previous.x || tile.y !== previous.y) this.onLocation?.(tile);
  }

  setEntity(entity: Pick<GameEntity, 'id'> & Partial<GameEntity>): void {
    if (entity.id === this.self.id) return;
    const previous = this.entities.get(entity.id);
    if (!previous && (entity.kind === undefined || entity.x === undefined || entity.y === undefined)) return;
    const x = entity.x ?? previous!.x, y = entity.y ?? previous!.y;
    const direction = previous ? this.direction(previous.x, previous.y, x, y, previous.direction) : 'down';
    this.entities.set(entity.id, { ...previous, ...entity,
      kind: entity.kind ?? previous!.kind, x, y, direction });
  }

  removeEntity(id: number): void {
    this.entities.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  select(id: number | null): void { this.selectedId = id; }
  attack(): void { this.attackingUntil = performance.now() + 390; this.actionStart = performance.now(); }
  moveDirection(dx: number, dy: number): { x: number; y: number } | null {
    const map = this.gameMap;
    if (!map) return null;
    this.updateSelf(performance.now());
    const x = Math.round(this.self.x + dx), y = Math.round(this.self.y + dy);
    if (!this.walkable(x, y)) return null;
    return { x, y };
  }

  hit(clientX: number, clientY: number): { entity?: GameEntity; tile?: { x: number; y: number }; blocked?: boolean } {
    const map = this.gameMap;
    if (!map) return {};
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return {};
    // Convert screen coordinates to the logical pixels used for drawing,
    // independently of CSS scaling, browser zoom and device pixel ratio.
    const px = (clientX - box.left) * this.cssWidth / box.width;
    const py = (clientY - box.top) * this.cssHeight / box.height;
    if (px < 0 || py < 0 || px >= this.cssWidth || py >= this.cssHeight) return {};
    for (let index = this.hitRegions.length - 1; index >= 0; index--) {
      const region = this.hitRegions[index];
      const dx = px - region.x, dy = py - region.y;
      if (dx < 0 || dy < 0 || dx >= region.width || dy >= region.height) continue;
      if (region.circle && Math.hypot(dx - region.width / 2, dy - region.height / 2) > region.width / 2) continue;
      if (region.sprite) {
        const source = ((region.sy! + Math.floor(dy)) * region.sprite.image.width + region.sx! + Math.floor(dx)) * 4;
        if (region.sprite.pixels[source + 3] < 32) continue;
      }
      const entity = this.entities.get(region.id);
      if (entity) { this.selectedId = entity.id; return { entity }; }
    }
    this.selectedId = null;
    const x = Math.floor((px + this.cameraX) / map.tw), y = Math.floor((py + this.cameraY) / map.th);
    return this.walkable(x, y) ? { tile: { x, y } } : { blocked: true };
  }

  private walkable(x: number, y: number): boolean {
    const map = this.gameMap;
    if (!map || x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    for (const layer of map.layers) {
      if (!layer.name.toLowerCase().startsWith('collision')) continue;
      const lx = x - layer.x, ly = y - layer.y;
      if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) continue;
      // Mana's mapreader.cpp blocks only tile 1 of the collision TSX (firstgid 1 => gid 2).
      if ((layer.gids[ly * layer.width + lx] & 0x1fffffff) === 2) return false;
    }
    return true;
  }

  private direction(x: number, y: number, nx: number, ny: number,
    fallback: Actor['direction'] = 'down'): Actor['direction'] {
    if (Math.abs(nx - x) > Math.abs(ny - y)) return nx > x ? 'right' : 'left';
    if (ny !== y) return ny > y ? 'down' : 'up';
    return fallback;
  }

  private resize(): void {
    this.cssWidth = Math.max(1, this.canvas.clientWidth);
    this.cssHeight = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private draw = (now: number): void => {
    this.frame = requestAnimationFrame(this.draw);
    const ctx = this.ctx;
    this.hitRegions = [];
    ctx.fillStyle = '#121f21';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    const map = this.gameMap;
    if (!map) return;
    this.updateSelf(now);
    this.cameraX = Math.max(0, Math.min(map.width * map.tw - this.cssWidth,
      (this.self.x + .5) * map.tw - this.cssWidth / 2));
    this.cameraY = Math.max(0, Math.min(map.height * map.th - this.cssHeight,
      (this.self.y + .5) * map.th - this.cssHeight / 2));
    this.cameraX = Math.floor(this.cameraX); this.cameraY = Math.floor(this.cameraY);
    const actors = [...this.entities.values(), this.self].sort((a, b) =>
      (a.y - b.y) || (a.x - b.x));
    let actorsDrawn = false;
    for (const layer of map.layers) {
      if (!(layer.mask & map.mask) || layer.name.toLowerCase().startsWith('collision')) continue;
      if (layer.name.toLowerCase().startsWith('fringe') && !actorsDrawn) {
        // Match Mana: beings are interleaved with the rows of the fringe layer.
        let i = 0;
        const low = Math.max(0, Math.floor(this.cameraY / map.th) - 4);
        const high = Math.min(map.height, Math.ceil((this.cameraY + this.cssHeight) / map.th) + 4);
        for (let y = low; y < high; y++) {
          while (i < actors.length && (actors[i].y + .5) * map.th + 16 <= y * map.th) {
            this.drawActor(actors[i++], now);
          }
          this.drawLayer(layer, now, y);
        }
        while (i < actors.length) this.drawActor(actors[i++], now);
        actorsDrawn = true;
      } else {
        if (!actorsDrawn && /^over/i.test(layer.name)) {
          actors.forEach(actor => this.drawActor(actor, now));
          actorsDrawn = true;
        }
        this.drawLayer(layer, now);
      }
    }
    if (!actorsDrawn) actors.forEach(actor => this.drawActor(actor, now));
  };

  private drawLayer(layer: Layer, now: number, singleRow?: number): void {
    const map = this.gameMap!;
    const minX = Math.max(layer.x, Math.floor(this.cameraX / map.tw) - 3);
    const maxX = Math.min(layer.x + layer.width, Math.ceil((this.cameraX + this.cssWidth) / map.tw) + 3);
    const minY = singleRow ?? Math.max(layer.y, Math.floor(this.cameraY / map.th) - 4);
    const maxY = singleRow === undefined ?
      Math.min(layer.y + layer.height, Math.ceil((this.cameraY + this.cssHeight) / map.th) + 4) : singleRow + 1;
    for (let y = minY; y < maxY; y++) {
      if (y < layer.y || y >= layer.y + layer.height) continue;
      for (let x = minX; x < maxX; x++) {
        const gid = layer.gids[(y - layer.y) * layer.width + x - layer.x] & 0x1fffffff;
        if (!gid) continue;
        let ts: Tileset | undefined;
        for (let i = map.tilesets.length - 1; i >= 0; i--) {
          if (gid >= map.tilesets[i].firstgid) { ts = map.tilesets[i]; break; }
        }
        if (!ts) continue;
        let index = gid - ts.firstgid;
        const frames = ts.animations.get(index);
        if (frames?.length) {
          const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
          let tick = now % total;
          for (const frame of frames) {
            if (tick < frame.duration) { index = frame.tileid; break; }
            tick -= frame.duration;
          }
        }
        if (index < 0 || index >= ts.count) continue;
        const sx = ts.margin + (index % ts.columns) * (ts.width + ts.spacing);
        const sy = ts.margin + Math.floor(index / ts.columns) * (ts.height + ts.spacing);
        const dx = x * map.tw - this.cameraX;
        const dy = (y + 1) * map.th - ts.height - this.cameraY;
        this.ctx.drawImage(ts.image, sx, sy, ts.width, ts.height, dx, dy, ts.width, ts.height);
      }
    }
  }

  private drawActor(actor: Actor, now: number): void {
    const map = this.gameMap!;
    const x = (actor.x + .5) * map.tw - this.cameraX;
    const y = (actor.y + .5) * map.th - this.cameraY + 16;
    if (x < -100 || y < -100 || x > this.cssWidth + 100 || y > this.cssHeight + 100) return;
    const self = actor.id === this.self.id;
    const sprite = actor.kind === 'monster' && actor.job === 1002 ? this.maggot :
      actor.kind === 'player' ? this.avatar : null;
    if (actor.id === this.selectedId) {
      this.ctx.strokeStyle = actor.kind === 'monster' ? '#e89574' : '#eec979';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath(); this.ctx.ellipse(x, y - 6, 22, 9, 0, 0, Math.PI * 2); this.ctx.stroke();
    }
    if (sprite) {
      const action = self && now < this.attackingUntil ? 'attack' :
        self && this.motion.active ? 'walk' : 'stand';
      const frames = sprite.actions.get(`${action}:${actor.direction}`) ??
        sprite.actions.get(`stand:${actor.direction}`) ?? [];
      if (frames.length) {
        const duration = frames.reduce((sum, frame) => sum + frame.delay, 0);
        let tick = (action === 'attack' ? now - this.actionStart : now) % duration;
        let selected = frames[0];
        for (const frame of frames) {
          selected = frame;
          if (tick < frame.delay) break;
          tick -= frame.delay;
        }
        const columns = Math.floor(sprite.image.width / sprite.width);
        const sx = (selected.index % columns) * sprite.width;
        const sy = Math.floor(selected.index / columns) * sprite.height;
        const dx = Math.round(x - sprite.width / 2 + selected.ox);
        const dy = Math.round(y - sprite.height + selected.oy);
        this.ctx.drawImage(sprite.image, sx, sy, sprite.width, sprite.height,
          dx, dy, sprite.width, sprite.height);
        if (!self) this.hitRegions.push({ id: actor.id, x: dx, y: dy,
          width: sprite.width, height: sprite.height, sprite, sx, sy });
      }
    } else {
      // NPCs have multiple dyed equipment sprites; identify them clearly until composed sprites are supported.
      const color = actor.kind === 'monster' ? '#b77b68' : actor.kind === 'item' ? '#ebc86b' : '#84bcb4';
      this.ctx.fillStyle = 'rgba(12,25,26,.72)';
      this.ctx.beginPath(); this.ctx.arc(x, y - 17, 17, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.strokeStyle = color; this.ctx.lineWidth = 2; this.ctx.stroke();
      this.ctx.fillStyle = color; this.ctx.font = 'bold 17px sans-serif';
      this.ctx.textAlign = 'center'; this.ctx.fillText(actor.kind === 'npc' ? '!' : actor.kind === 'item' ? '◆' : '✦', x, y - 11);
      if (!self) this.hitRegions.push({ id: actor.id, x: x - 19, y: y - 36, width: 38, height: 38, circle: true });
    }
    if (actor.name) {
      this.ctx.font = 'bold 11px system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      const label = actor.name.slice(0, 22);
      const width = this.ctx.measureText(label).width + 12;
      this.ctx.fillStyle = 'rgba(8,19,23,.8)';
      this.ctx.fillRect(x - width / 2, y - (sprite?.height ?? 42) - 16, width, 17);
      this.ctx.fillStyle = self ? '#e8d8a8' : '#e5f0e9';
      this.ctx.fillText(label, x, y - (sprite?.height ?? 42) - 4);
      if (!self) this.hitRegions.push({ id: actor.id, x: x - width / 2,
        y: y - (sprite?.height ?? 42) - 16, width, height: 17 });
    }
    if (actor.maxHp && actor.hp !== undefined && actor.hp < actor.maxHp) {
      const ratio = Math.max(0, Math.min(1, actor.hp / actor.maxHp));
      this.ctx.fillStyle = '#213031'; this.ctx.fillRect(x - 17, y + 1, 34, 4);
      this.ctx.fillStyle = '#c66f5e'; this.ctx.fillRect(x - 17, y + 1, 34 * ratio, 4);
    }
  }
}
