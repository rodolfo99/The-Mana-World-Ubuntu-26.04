import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANA_COLORS, parseTmwText } from '../src/app/text-format.ts';

const plain = parts => parts.map(part => part.text).join('');

test('Mana font and color codes become bounded text styles and reset per row', () => {
  const parts = parseTmwText('##BAtención: ##1rojo##b normal\nSiguiente ##3azul##0 base');
  assert.equal(plain(parts), 'Atención: rojo normal\nSiguiente azul base');
  assert.deepEqual(parts.find(part => part.text === 'rojo'), { text: 'rojo', bold: true, color: MANA_COLORS['1'] });
  assert.equal(parts.find(part => part.text.includes('Siguiente')).bold, false);
  assert.equal(parts.find(part => part.text.includes('Siguiente')).color, null);
  for (const [code, color] of Object.entries(MANA_COLORS))
    assert.equal(parseTmwText(`##${code}color`)[0].color, color);
  assert.equal(plain(parseTmwText('##Vtexto')), 'texto'); // Native fallback: reset unknown color.
});

test('links use supplied item captions or a readable ID and allow only explicit HTTP(S)', () => {
  const parts = parseTmwText('[@@501|@@] [@@502|Poción@@] [@@999|@@] @@https://example.org/help|Ayuda@@', id => id === 501 ? 'Cactus Drink' : undefined);
  assert.equal(plain(parts), '[Cactus Drink] [Poción] [Objeto 999] Ayuda');
  assert.equal(parts.find(part => part.itemId === 501).text, 'Cactus Drink');
  assert.deepEqual(parts.filter(part => part.href).map(part => [part.text, part.href]), [['Ayuda', 'https://example.org/help']]);
  for (const target of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/a', '//example.org', 'https://user:secret@example.org', 'https://example.org/\tbad'])
    assert.ok(parseTmwText(`@@${target}|Texto@@`).every(part => !part.href), target);
});

test('captions, malformed markup and HTML remain inert text; link styles have no HTML channel', () => {
  const parts = parseTmwText('@@https://example.org|##B<img src=x onerror=alert(1)>##b@@');
  assert.equal(plain(parts), '<img src=x onerror=alert(1)>');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].bold, true);
  assert.equal(plain(parseTmwText('## @@broken|not closed ###keyMissing')), '## @@broken|not closed ###keyMissing');
});

test('native key tokens resolve to implemented web controls without inventing shortcuts', () => {
  const parts = parseTmwText('[###keyMoveUp;] [###keyWindowInventory;] [###keyPickup;] [###keyBeingSit;] [###unknown;]');
  assert.equal(plain(parts), '[W / ↑] [I] [clic en el objeto del suelo] [control no disponible en este cliente web] [control no disponible en este cliente web]');
  for (const key of ['constructor', '__proto__', 'toString'])
    assert.equal(plain(parseTmwText(`###${key};`)), 'control no disponible en este cliente web');
});
