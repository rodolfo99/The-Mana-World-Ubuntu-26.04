/** Supported stand animations from pinned Mana's NPCDB / SpriteDef / Dye.
 * All layers must load successfully. Unsupported definitions retain the marker.
 */
export type SpriteDirection = 'default' | 'up' | 'down' | 'left' | 'right' |
  'upleft' | 'upright' | 'downleft' | 'downright';
export interface NpcSpriteReference { file: string; variant: number }
export interface SpriteSheet {
  image: HTMLCanvasElement;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface NpcFrame { sheet: SpriteSheet; index: number; delay: number; ox: number; oy: number }
export interface NpcLayer { animations: Map<SpriteDirection, NpcFrame[]> }
type Palette = number[][];
const directionOrder: SpriteDirection[] = ['default', 'up', 'down', 'left', 'right',
  'upleft', 'upright', 'downleft', 'downright'];

function localPath(path: string, extension: 'xml' | 'png'): string {
  if (path.length > 512 || !/^[\w/.-]+$/.test(path) || !path.endsWith(`.${extension}`) ||
    !path.split('/').every(part => part && part !== '.' && part !== '..'))
    throw new Error('Ruta de sprite no local');
  return path;
}

function integer(node: Element, name: string, fallback = 0): number {
  const text = node.getAttribute(name);
  if (text === null) return fallback;
  if (!/^-?\d+$/.test(text)) throw new Error(`Valor inválido: ${name}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || Math.abs(value) > 65535) throw new Error(`Valor fuera de rango: ${name}`);
  return value;
}

// Dye::instantiate substitutes palettes only into bare channel placeholders.
export function instantiateDye(source: string, palettes: string): string {
  const parts = source.split('|');
  if (parts.length === 1) return source;
  if (parts.length !== 2) throw new Error('Tinte inválido');
  // Mana leaves an entirely uninstantiated template unchanged; Dye then has
  // no palettes, so the PNG is unchanged (e.g. Sorfina's adult-head overlay).
  if (!palettes && /^[RGYBMCW](;[RGYBMCW])*$/.test(parts[1])) return parts[0];
  const supplied = palettes ? palettes.split(';') : [];
  let index = 0;
  const channels = parts[1].split(';').map(channel => {
    if (/^[RGYBMCW]$/.test(channel)) {
      const palette = supplied[index++];
      if (!palette) throw new Error('Falta una paleta');
      return `${channel}:${palette}`;
    }
    return channel;
  });
  return `${parts[0]}|${channels.join(';')}`;
}

/** Integer interpolation and pure-color masks match resources/dye.cpp. */
export function dyePixels(pixels: Uint8ClampedArray, description: string): void {
  if (!description) return;
  const palettes = new Map<number, Palette>();
  const masks: Record<string, number> = { R: 1, G: 2, Y: 3, B: 4, M: 5, C: 6, W: 7 };
  for (const channel of description.split(';')) {
    const match = /^([RGYBMCW]):#([\da-fA-F]{6}(?:,[\da-fA-F]{6})*)$/.exec(channel);
    if (!match || match[2].length > 4096) throw new Error('Paleta no compatible');
    palettes.set(masks[match[1]], match[2].split(',').map(color =>
      [0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16))));
  }
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), sum = r + g + b;
    if (!max || min !== max && (min !== 0 || sum !== max && sum !== 2 * max)) continue;
    const palette = palettes.get((r ? 1 : 0) | (g ? 2 : 0) | (b ? 4 : 0));
    if (!palette) continue;
    const scaled = max * palette.length, i = Math.floor(scaled / 255), t = scaled % 255;
    const next = palette[t ? i : i - 1], previous = i > 0 ? palette[i - 1] : [0, 0, 0];
    for (let component = 0; component < 3; component++) {
      pixels[offset + component] = t ? Math.floor(((255 - t) * previous[component] + t * next[component]) / 255) : next[component];
    }
  }
}

// Action::getAnimation: diagonal -> vertical, then first enum direction.
export function npcFrame(layer: NpcLayer, direction: SpriteDirection, elapsed: number): NpcFrame {
  const vertical = direction.startsWith('up') ? 'up' : direction.startsWith('down') ? 'down' : direction;
  const frames = layer.animations.get(direction) ?? layer.animations.get(vertical) ??
    layer.animations.get(directionOrder.find(value => layer.animations.has(value))!)!;
  const stop = frames.findIndex(frame => frame.delay === 0);
  const duration = frames.reduce((sum, frame) => sum + frame.delay, 0);
  const time = Math.max(0, Math.floor(elapsed));
  // Sprite::updateCurrentAnimation advances only when time > delay, not >=.
  let tick = stop >= 0 ? time : time === 0 ? 0 : (time - 1) % duration + 1;
  for (const frame of frames) {
    if (frame.delay === 0 || tick <= frame.delay) return frame;
    tick -= frame.delay;
  }
  return frames[frames.length - 1];
}

export class NpcSpriteLibrary {
  private decodedPixels = 0;
  private readonly documents = new Map<string, Promise<Element>>();
  private readonly sheets = new Map<string, Promise<SpriteSheet>>();
  private readonly pending = new Map<string, Promise<NpcLayer[] | null>>();
  private readonly ready = new Map<string, NpcLayer[] | null>();

  peek(references: NpcSpriteReference[]): NpcLayer[] | null {
    const key = JSON.stringify(references);
    if (!this.pending.has(key)) void this.load(references);
    return this.ready.get(key) ?? null;
  }

  load(references: NpcSpriteReference[]): Promise<NpcLayer[] | null> {
    const key = JSON.stringify(references);
    const known = this.pending.get(key);
    if (known) return known;
    if (this.pending.size >= 512) return Promise.resolve(null);
    const task = Promise.resolve().then(async () => {
      if (!Array.isArray(references) || !references.length || references.length > 32) throw new Error('Capas inválidas');
      return Promise.all(references.map(reference => this.loadLayer(reference)));
    }).catch(() => null).then(layers => { this.ready.set(key, layers); return layers; });
    this.pending.set(key, task);
    return task;
  }

  private document(path: string): Promise<Element> {
    localPath(path, 'xml');
    let request = this.documents.get(path);
    if (!request) {
      if (this.documents.size >= 2048) throw new Error('Demasiados sprites');
      request = fetch(`/assets/graphics/sprites/${path}`, { signal: AbortSignal.timeout(8000) }).then(async response => {
        if (!response.ok) throw new Error('Falta XML de sprite');
        const source = await response.text();
        if (source.length > 512 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML no permitido');
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'sprite') throw new Error('XML inválido');
        return doc.documentElement;
      });
      this.documents.set(path, request);
    }
    return request;
  }

  private sheet(node: Element, palettes: string): Promise<SpriteSheet> {
    const source = instantiateDye(node.getAttribute('src') ?? '', palettes);
    const [path, dye = ''] = source.split('|');
    localPath(path, 'png');
    if (!path.startsWith('graphics/sprites/')) throw new Error('PNG fuera de sprites');
    const width = integer(node, 'width'), height = integer(node, 'height');
    if (width < 1 || height < 1 || width > 2048 || height > 2048) throw new Error('Dimensiones inválidas');
    const key = JSON.stringify([source, width, height]);
    let request = this.sheets.get(key);
    if (!request) {
      if (this.sheets.size >= 1024) throw new Error('Demasiadas imágenes');
      request = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => { image.src = ''; reject(new Error('Tiempo de imagen agotado')); }, 8000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('Falta PNG de sprite')); };
        image.src = `/assets/${path}`;
      }).then(image => {
        if (image.width * image.height > 8 * 1024 * 1024 || image.width < width || image.height < height)
          throw new Error('Imagen demasiado grande o incompleta');
        if (this.decodedPixels + image.width * image.height > 32 * 1024 * 1024)
          throw new Error('Presupuesto de imágenes agotado');
        this.decodedPixels += image.width * image.height;
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        dyePixels(data.data, dye);
        ctx.putImageData(data, 0, 0);
        return { image: canvas, pixels: data.data, width, height };
      });
      this.sheets.set(key, request);
    }
    return request;
  }

  private async loadLayer(reference: NpcSpriteReference): Promise<NpcLayer> {
    if (typeof reference.file !== 'string' || reference.file.length > 4096 ||
      !Number.isInteger(reference.variant) || reference.variant < 0 || reference.variant > 65535)
      throw new Error('Referencia inválida');
    const [file, palettes = '', ...extra] = reference.file.split('|');
    if (extra.length) throw new Error('Referencia inválida');
    const images = new Map<string, { node: Element; palettes: string }>();
    const actions = new Map<string, { node: Element; image: { node: Element; palettes: string }; variant: number }>();
    const visited = new Set<string>();
    const visit = async (path: string, variant: number, dyes: string, depth: number): Promise<void> => {
      if (depth > 16 || visited.size >= 64 || visited.has(path)) throw new Error('Include circular o excesivo');
      visited.add(path);
      const root = await this.document(path);
      const count = integer(root, 'variants');
      const shift = count > 0 && variant < count ? variant * integer(root, 'variant_offset') : 0;
      for (const child of Array.from(root.children)) {
        if (child.localName === 'imageset') {
          const name = child.getAttribute('name') ?? '';
          // Includes use the caller's previously defined imageset, as in Mana.
          if (!images.has(name)) images.set(name, { node: child, palettes: dyes });
        } else if (child.localName === 'include') {
          // SpriteDef::includeSprite resets variant AND palettes for the include.
          await visit(child.getAttribute('file') ?? '', 0, '', depth + 1);
        } else if (child.localName === 'action') {
          const image = images.get(child.getAttribute('imageset') ?? '');
          if (!image) throw new Error('Imageset ausente');
          const action = { node: child, image, variant: shift };
          if (!actions.size) actions.set('stand', action); // SpriteAction::DEFAULT is stand
          actions.set(child.getAttribute('name') ?? '', action);
        } else throw new Error('Elemento de sprite no compatible');
      }
    };
    await visit(file, reference.variant, palettes, 0);
    const action = actions.get('stand');
    if (!action) throw new Error('Falta animación stand');
    const sheet = await this.sheet(action.image.node, action.image.palettes);
    const frameCount = Math.floor(sheet.image.width / sheet.width) * Math.floor(sheet.image.height / sheet.height);
    const animations = new Map<SpriteDirection, NpcFrame[]>();
    for (const animation of Array.from(action.node.children)) {
      if (animation.localName !== 'animation') throw new Error('Animación no compatible');
      const direction = (animation.getAttribute('direction') || 'default') as SpriteDirection;
      if (!directionOrder.includes(direction)) throw new Error('Dirección no compatible');
      const frames: NpcFrame[] = [];
      for (const frame of Array.from(animation.children)) {
        const delay = integer(frame, 'delay', 75); // sprite.h DEFAULT_FRAME_DELAY
        const ox = integer(frame, 'offsetX') + integer(action.image.node, 'offsetX');
        const oy = integer(frame, 'offsetY') + integer(action.image.node, 'offsetY');
        if (delay < 0 || Math.abs(ox) > 2048 || Math.abs(oy) > 2048) throw new Error('Frame inválido');
        const start = integer(frame, frame.localName === 'frame' ? 'index' : 'start', -1);
        const end = frame.localName === 'frame' ? start : integer(frame, 'end', -1);
        if (!['frame', 'sequence'].includes(frame.localName) || start < 0 || end < start ||
          end - start > 4096 || frames.length + end - start + 1 > 4096) throw new Error('Secuencia no compatible');
        for (let index = start; index <= end; index++) {
          const actual = index + action.variant;
          if (actual < 0 || actual >= frameCount) throw new Error('Frame fuera de la imagen');
          frames.push({ sheet, index: actual, delay, ox, oy });
        }
      }
      if (!frames.length) throw new Error('Animación vacía');
      animations.set(direction, frames);
    }
    if (!animations.size) throw new Error('Sprite sin frames');
    return { animations };
  }
}
