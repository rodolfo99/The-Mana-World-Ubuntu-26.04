import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/tutorial-web.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { adaptNpcText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// Read literal mes statements from the pinned tutorial itself, so the fixtures
// cannot silently drift away from what the real server tells the player.
function npcLines(name) {
  const script = readFileSync(new URL(`../../sources/serverdata/world/map/npc/029-2/${name}.txt`, import.meta.url), 'utf8');
  return [...script.matchAll(/^\s*mes ("(?:[^"\\]|\\.)*");\s*$/gm)].map(match => JSON.parse(match[1]));
}
const sorfina = npcLines('sorfina');
const tanisha = npcLines('tanisha');
const morgan = npcLines('morgan');
function line(lines, fragment) {
  const result = lines.find(text => text.includes(fragment));
  assert.notEqual(result, undefined, `Tutorial fixture is missing: ${fragment}`);
  return result;
}

test('Sorfina teaches the actual movement, inventory and clothing controls', () => {
  const movement = [line(sorfina, 'keyMoveUp'), line(sorfina, 'keyMoveLeft'), line(sorfina, 'o haga clic')].join('\n');
  const adaptedMovement = adaptNpcText(movement);
  assert.match(adaptedMovement, /W o ↑.*S o ↓/);
  assert.match(adaptedMovement, /A o ←.*D o →/);
  assert.match(adaptedMovement, /haz clic/);
  assert.doesNotMatch(adaptedMovement, /###|Press|press/);

  for (const fragment of ['keyWindowInventory;] or', 'inventario pulsando F3', 'keyWindowInventory;] to']) {
    const result = adaptNpcText(line(sorfina, fragment));
    assert.match(result, /pulsa I o el botón Inventario del panel lateral/);
    assert.doesNotMatch(result, /F3|upper right|superior derecha/);
  }
  for (const fragment of ['doble clic en la ropa', 'botón de equipación']) {
    const original = line(sorfina, fragment);
    const result = adaptNpcText(original);
    assert.match(result, /Equipar junto a cada prenda/);
    assert.doesNotMatch(result, /doble clic/);
    assert.equal(result.startsWith('"'), original.startsWith('"'));
    assert.equal(result.endsWith('"'), original.endsWith('"'));
  }
  assert.match(adaptNpcText(line(sorfina, 'Para usar o equipar')), /pulsa Usar o Equipar/);
});

test('Sorfina replaces native targeting keys and settings with available web controls', () => {
  for (const fragment of ['To interact with things', 'presionar N para', 'Talk to me again', 'Or you can press']) {
    const result = adaptNpcText(line(sorfina, fragment));
    assert.match(result, /clic/);
    assert.doesNotMatch(result, /###|presionar N|keyTalk/);
  }
  const settings = adaptNpcText(line(sorfina, 'pestaña Keyboard'));
  assert.match(settings, /Pulsa Controles en el panel lateral/);
  assert.match(settings, /no se pueden reasignar/);
  assert.doesNotMatch(settings, /Configurar|Keyboard/);
  assert.match(adaptNpcText(line(sorfina, 'keyChat;] to open')), /pulsa Enter/);
  assert.match(adaptNpcText(line(sorfina, 'keyWindowChat')), /permanece visible/);
});

test('Tanisha describes click attack, selected-target Space, stop and pickup accurately', () => {
  for (const original of tanisha.filter(text => text.includes('keyTargetMonster'))) {
    const result = adaptNpcText(original);
    assert.match(result, /Haz clic en un monstruo para seleccionarlo y empezar a atacar/);
    assert.match(result, /objetivo seleccionado.*Espacio o el botón Atacar/);
    assert.doesNotMatch(result, /###/);
  }
  for (const original of tanisha.filter(text => text.includes('keyTarget;]'))) {
    assert.match(adaptNpcText(original), /Pulsa Detener en el panel del objetivo/);
  }
  for (const original of tanisha.filter(text => text.includes('keyPickup'))) {
    assert.match(adaptNpcText(original), /Haz clic en los objetos del suelo/);
  }
});

test('unimplemented native features have explicit availability instead of invented shortcuts', () => {
  assert.match(adaptNpcText(line(sorfina, 'keyWindowShortcut')), /no tiene una ventana/);
  assert.match(adaptNpcText(line(sorfina, "'/whisper")), /todavía no permite enviar susurros/);
  assert.match(adaptNpcText(line(tanisha, 'keyWindowStatus')), /todavía no tiene una ventana para repartir/);
  assert.match(adaptNpcText(line(tanisha, 'keyBeingSit')), /todavía no tiene un control para sentarse/);
});

test('all native tutorial key tokens are replaced in their actual instruction lines', () => {
  const instructions = [...sorfina, ...tanisha].filter(text => text.includes('[###key'));
  assert.ok(instructions.length >= 20);
  for (const instruction of instructions) assert.doesNotMatch(adaptNpcText(instruction), /\[###key/, instruction);
});

test('Morgan teaches chat casting without changing invocation text, names, or unrelated prose', () => {
  assert.match(adaptNpcText(line(morgan, 'Para lanzar un hechizo')), /invocación exactamente.*Enter/);
  for (const text of [
    '[Morgan]\n"Empecemos con un ataque básico de varitas. #confringo"',
    '##B#confringo##b y #discharge',
    '##3Acércate a Sorfina.',
    '<script>alert("hola")</script>',
    'Personaje: "Una vez que dejemos de hablar, haga doble clic en la ropa para equipar."',
    'Para usar la varita necesitas tenerla equipada y hablar el encantamiento para dejarla tocar en tu mana.',
    ...sorfina.filter(text => text.includes('Hasan') || text.includes('Kazai')),
    ...morgan.filter(text => !text.includes('Para lanzar un hechizo')),
  ]) assert.equal(adaptNpcText(text), text);
});

test('adapting a whole dialog preserves line breaks, surrounding quotes and unknown formatting', () => {
  const original = `  ${line(sorfina, 'doble clic en la ropa')}  \r\n##BMensaje de otra misión##b\n`;
  assert.equal(adaptNpcText(original), '  "Una vez que dejemos de hablar, abre el Inventario y pulsa Equipar junto a cada prenda."  \r\n##BMensaje de otra misión##b\n');
  assert.equal(adaptNpcText(adaptNpcText(original)), adaptNpcText(original));
});
