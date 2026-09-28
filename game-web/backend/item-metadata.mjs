import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SaxesParser } from 'saxes';

// Names in the native item database are relative to client-data, even in nested
// includes. Only local, unencoded paths are accepted; never resolve a URL.
function localPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[\\:%?#\s\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}

function inside(root, file) {
  const path = relative(root, file);
  return path && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function localFile(root, path) {
  const file = realpathSync(resolve(root, path));
  if (!inside(root, file) || !statSync(file).isFile()) throw new Error('Recurso fuera del catálogo');
  return file;
}

function parseItems(xml) {
  const entries = [];
  let depth = 0;
  const parser = new SaxesParser();
  // No DTDs, external resources or custom entity expansion. Standard XML
  // escapes and numeric character references are decoded by the strict parser.
  parser.on('doctype', () => { throw new Error('DTD no permitido'); });
  parser.on('opentag', node => {
    depth++;
    if (depth > 64 || depth === 1 && node.name !== 'items') throw new Error('XML de objetos inválido');
    if (depth === 2 && (node.name === 'include' || node.name === 'item'))
      entries.push({ type: node.name, attributes: node.attributes });
  });
  parser.on('closetag', () => { depth--; });
  parser.write(xml).close();
  return entries;
}

/** Load a bounded, read-only snapshot. Missing/invalid branches leave ID fallbacks usable. */
export function loadItemMetadata(assetRoot) {
  const catalog = new Map();
  let root;
  try { root = realpathSync(assetRoot); }
  catch { return catalog; }
  const visited = new Set();
  let references = 0, bytes = 0;

  function iconUrl(image) {
    if (typeof image !== 'string') return undefined;
    // Mana's suffix after '|' is a dye specification, not part of the filename.
    // Keep the original base image; tint rendering is not implemented here.
    const path = image.split('|', 1)[0];
    if (!localPath(path) || extname(path).toLowerCase() !== '.png') return undefined;
    try {
      const imageRoot = realpathSync(join(root, 'graphics/items'));
      if (!inside(root, imageRoot)) return undefined;
      localFile(imageRoot, path); // Includes symlink containment and existence checks.
      return `/assets/graphics/items/${path.split('/').map(encodeURIComponent).join('/')}`;
    } catch { return undefined; }
  }

  function visit(path, depth) {
    // These bounds cover the pinned catalog (about 1,200 small XML files) and
    // also stop cycles, excessive include graphs and oversized local files.
    if (depth > 16 || ++references > 4096 || !localPath(path) ||
      extname(path).toLowerCase() !== '.xml') return;
    let entries;
    try {
      const file = localFile(root, path);
      if (visited.has(file)) return;
      visited.add(file);
      const size = statSync(file).size;
      if (size > 256 * 1024 || bytes + size > 16 * 1024 * 1024) return;
      bytes += size;
      entries = parseItems(readFileSync(file, 'utf8'));
    } catch { return; } // Discard the entire malformed file, not its valid prefix.

    for (const { type, attributes } of entries) {
      if (type === 'include') {
        visit(attributes.name, depth + 1);
        continue;
      }
      if (!/^\d+$/.test(attributes.id ?? '')) continue;
      const id = Number(attributes.id);
      if (!Number.isSafeInteger(id) || id < 1 || id > 65535) continue;
      const metadata = {};
      const name = attributes.name?.trim();
      if (name && name.length <= 256) metadata.name = name;
      const icon = iconUrl(attributes.image);
      if (icon) metadata.iconUrl = icon;
      // Like Mana, later definitions of an ID replace earlier ones. Never
      // synthesize a name or copy protocol state from a metadata attribute.
      catalog.set(id, Object.freeze(metadata));
    }
  }
  visit('items.xml', 0);
  return catalog;
}

export function inventoryWithMetadata(items, catalog) {
  return items.map(item => {
    const { name, iconUrl } = catalog.get(item.id) ?? {};
    return { ...item, ...(name ? { name } : {}), ...(iconUrl ? { iconUrl } : {}) };
  });
}
