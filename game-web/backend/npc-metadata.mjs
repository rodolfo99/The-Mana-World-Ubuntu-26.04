import { readFileSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep, isAbsolute } from 'node:path';
import { SaxesParser } from 'saxes';

const localXml = path => typeof path === 'string' && path.length <= 512 &&
  /^[\w/-]+\.xml$/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');

function parse(source) {
  const entries = [];
  let depth = 0, npc, sprite;
  const parser = new SaxesParser();
  parser.on('doctype', () => { throw new Error('DTD no permitido'); });
  parser.on('opentag', node => {
    depth++;
    if (depth > 32 || depth === 1 && node.name !== 'npcs') throw new Error('Catálogo NPC inválido');
    if (depth === 2 && node.name === 'include') entries.push({ include: node.attributes.name });
    if (depth === 2 && node.name === 'npc') {
      npc = { id: node.attributes.id, sprites: [], supported: true };
      entries.push(npc);
    }
    if (npc && depth === 3) {
      if (node.name === 'sprite') {
        sprite = { file: '', variant: Number(node.attributes.variant ?? 0) };
        npc.sprites.push(sprite);
      } else npc.supported = false; // particlefx needs its own renderer
    }
    if (npc && depth > 3) npc.supported = false;
  });
  parser.on('text', value => { if (sprite) sprite.file += value; });
  parser.on('closetag', () => {
    if (depth === 3) sprite = undefined;
    if (depth === 2) npc = undefined;
    depth--;
  });
  parser.write(source).close();
  return entries;
}

/** NPCDB order is the complete layer order, independent of player equipment. */
export function loadNpcMetadata(assetRoot) {
  const catalog = new Map();
  let root;
  try { root = realpathSync(assetRoot); } catch { return catalog; }
  const visited = new Set();
  let references = 0, bytes = 0;
  function visit(path, depth) {
    if (!localXml(path) || depth > 16 || ++references > 2048) return;
    let entries;
    try {
      const file = realpathSync(resolve(root, path)), rel = relative(root, file);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || visited.has(file)) return;
      visited.add(file);
      const stat = statSync(file);
      if (!stat.isFile() || stat.size > 256 * 1024 || (bytes += stat.size) > 8 * 1024 * 1024) return;
      entries = parse(readFileSync(file, 'utf8'));
    } catch { return; }
    for (const entry of entries) {
      if ('include' in entry) { visit(entry.include, depth + 1); continue; }
      if (!/^\d+$/.test(entry.id ?? '')) continue;
      const id = Number(entry.id);
      if (id < 46 || id > 1000) continue;
      for (const sprite of entry.sprites) sprite.file = sprite.file.trim();
      const valid = entry.supported && entry.sprites.length > 0 && entry.sprites.length <= 32 &&
        entry.sprites.every(({ file, variant }) => file.length <= 4096 && localXml(file.split('|')[0]) &&
          Number.isInteger(variant) && variant >= 0 && variant <= 65535);
      // An empty/unsupported later definition also replaces an earlier one.
      catalog.set(id, valid ? entry.sprites : null);
    }
  }
  visit('npcs.xml', 0);
  return catalog;
}
