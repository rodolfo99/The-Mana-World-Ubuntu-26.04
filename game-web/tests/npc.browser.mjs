import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright';
import { createGameServer } from '../backend/server.mjs';
import { loadNpcMetadata } from '../backend/npc-metadata.mjs';
import { GameSession } from '../backend/session.mjs';
import { appearancePacket, layouts } from './fixtures/appearance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalog = loadNpcMetadata(`${root}/sources/serverdata/client-data`);
const port = Number(process.env.NPC_WEB_TEST_PORT ?? 31321);
const origin = `http://127.0.0.1:${port}`;
const moduleSource = ts.transpileModule(readFileSync(new URL('../src/app/npc-sprites.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
let server, browser;

before(async () => {
  server = createGameServer({ port });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function newPage(t) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(6000);
  t.after(() => page.close());
  return page;
}

async function modulePage(t) {
  const page = await newPage(t);
  await page.route('**/npc-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.route('**/npc-test.js', route => route.fulfill({ contentType: 'text/javascript', body: moduleSource }));
  await page.goto(`${origin}/npc-test`);
  await page.evaluate(async () => {
    window.npcModule = await import('/npc-test.js');
    window.npcLibrary = new window.npcModule.NpcSpriteLibrary();
  });
  return page;
}

test('browser loads Sorfina from six original layers with inherited imagesets, real offsets and exact dyes', async t => {
  const page = await modulePage(t);
  const result = await page.evaluate(async refs => {
    const layers = await window.npcLibrary.load(refs);
    if (!layers) return null;
    const frames = layers.map(layer => window.npcModule.npcFrame(layer, 'down', 0));
    const sample = (frame, x, y) => [...frame.sheet.pixels.slice((y * frame.sheet.image.width + x) * 4,
      (y * frame.sheet.image.width + x) * 4 + 4)];
    return { count: layers.length, frames: frames.map(f => [f.index, f.sheet.width, f.sheet.height, f.ox, f.oy]),
      skin: sample(frames[0], 163, 278), hair: sample(frames[1], 11, 6), shirt: sample(frames[3], 36, 30) };
  }, catalog.get(154));
  assert.ok(result);
  assert.equal(result.count, 6);
  assert.deepEqual(result.frames[0], [0, 64, 64, 0, 0]);
  // hairstyle13-female's frame and image dimensions come from its pinned XML.
  assert.deepEqual(result.frames[1], [0, 32, 32, 3, -33]);
  assert.deepEqual(result.skin, [254, 255, 252, 255]); // white -> last W skin palette entry
  assert.deepEqual(result.hair, [253, 253, 253, 255]); // red -> last R hair palette entry
  assert.deepEqual(result.shirt, [115, 78, 30, 255]); // intensity 128 in the seven-entry shirt palette
});

test('original variant 5 uses frame 5 and default direction without fetching a made-up resource', async t => {
  const page = await modulePage(t);
  const result = await page.evaluate(async refs => {
    const layers = await window.npcLibrary.load(refs);
    const f = window.npcModule.npcFrame(layers[0], 'left', 10000);
    return [f.index, f.sheet.width, f.sheet.height, f.ox, f.oy];
  }, catalog.get(200));
  assert.deepEqual(result, [5, 50, 80, 0, 0]);
});

test('missing PNG rejects the whole composition, and failed loads are cached', async t => {
  const page = await modulePage(t);
  let requests = 0;
  await page.route('**/assets/graphics/sprites/equipment/feet/boots-female.png', route => {
    requests++; return route.fulfill({ status: 404, body: '' });
  });
  const results = await page.evaluate(async refs => [await window.npcLibrary.load(refs), await window.npcLibrary.load(refs)], catalog.get(154));
  assert.deepEqual(results, [null, null]);
  assert.equal(requests, 1);
});

test('sprite includes reset variants, inherit imagesets, add offsets, and reject unsupported or unsafe XML', async t => {
  const page = await modulePage(t);
  let outside = 0;
  page.on('request', request => { if (!request.url().startsWith(origin)) outside++; });
  const image = '<imageset name="base" src="graphics/sprites/model/unique.png" width="50" height="80" offsetX="3" offsetY="-2"/>';
  const frames = '<action name="stand" imageset="base"><animation><sequence start="1" end="2" delay="75" offsetX="-1" offsetY="4"/></animation></action>';
  const fixtures = {
    'parent.xml': `<sprite variants="10" variant_offset="10">${image}<include file="test-child.xml"/></sprite>`,
    'child.xml': `<sprite variants="10" variant_offset="10">${frames}</sprite>`,
    'bad.xml': '<sprite><imageset></sprite>',
    'cycle.xml': '<sprite><include file="test-cycle.xml"/></sprite>',
    'bounds.xml': `<sprite>${image}${frames.replace('end="2"', 'end="999"')}</sprite>`,
    'jump.xml': `<sprite>${image}${frames.replace('<sequence', '<jump')}</sprite>`,
    'dye.xml': `<sprite>${image.replace('unique.png', 'unique.png|W:broken')}${frames}</sprite>`,
    'url.xml': `<sprite>${image.replace('graphics/sprites/model/unique.png', 'https://invalid/asset.png')}${frames}</sprite>`,
    'dtd.xml': '<!DOCTYPE sprite [<!ENTITY a "x">]><sprite/>',
  };
  for (const [name, body] of Object.entries(fixtures)) await page.route(`**/assets/graphics/sprites/test-${name}`,
    route => route.fulfill({ contentType: 'application/xml', body }));
  const result = await page.evaluate(async () => {
    const layers = await window.npcLibrary.load([{ file: 'test-parent.xml', variant: 2 }]);
    const f = window.npcModule.npcFrame(layers[0], 'down', 76);
    const failed = [];
    for (const file of ['bad', 'cycle', 'bounds', 'jump', 'dye', 'url', 'dtd'])
      failed.push(await window.npcLibrary.load([{ file: `test-${file}.xml`, variant: 0 }]));
    for (const file of ['../outside.xml', 'https://invalid/file.xml', '%2e%2e/outside.xml'])
      failed.push(await window.npcLibrary.load([{ file, variant: 0 }]));
    return { frame: [f.index, f.ox, f.oy], failed };
  });
  assert.deepEqual(result.frame, [2, 2, 2]);
  assert.ok(result.failed.every(value => value === null));
  assert.equal(outside, 0);
});

async function worldPage(t, { job = 154, direction = 0, setup = async () => {} } = {}) {
  const page = await newPage(t);
  const commands = [];
  let socket;
  let spawnOnLoad = true;
  const emit = value => socket.send(JSON.stringify(value));
  const session = new GameSession({ readyState: 1, send: value => socket.send(value) }, new Map(), {}, { npcMetadata: catalog });
  session.send = () => {};
  function spawn(nextJob = job, nextDirection = direction) {
    const p = appearancePacket(layouts[0], { job: nextJob, direction: nextDirection });
    p[46] = 28 >> 2; p[47] = ((28 & 3) << 6) | (25 >> 4); p[48] = ((25 & 15) << 4) | nextDirection;
    session.receive(0x0078, p);
    emit({ type: 'entity', id: 5200, name: 'Sorfina' });
  }
  await page.routeWebSocket('**/game', webSocket => {
    socket = webSocket;
    socket.onMessage(raw => {
      const command = JSON.parse(String(raw)); commands.push(command);
      if (command.type === 'login') emit({ type: 'world', map: 'npc-test', x: 30, y: 25, id: 42, name: 'Aria' });
      if (command.type === 'loaded' && spawnOnLoad) spawn();
      if (command.type === 'talk') emit({ type: 'dialog', id: 5200, text: 'Prueba de diálogo', next: true });
    });
  });
  await page.route('**/assets/maps/npc-test.tmx', route => route.fulfill({ contentType: 'application/xml',
    body: '<map width="80" height="60" tilewidth="32" tileheight="32"/>' }));
  // Observe the actual built app's draw calls, without adding production hooks.
  await page.addInitScript(() => {
    window.npcDraws = []; window.npcMarkers = []; window.actorDraws = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.isConnected && args[2] > 100 && args[3] > 100) { window.npcDraws = []; window.npcMarkers = []; window.actorDraws = []; }
      return fill.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.isConnected && args[0] instanceof HTMLCanvasElement) window.npcDraws.push(args);
      if (this.canvas.isConnected && args[0] instanceof HTMLImageElement && args[0].src.includes('/graphics/sprites/'))
        window.actorDraws.push(args);
      return draw.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      if (this.canvas.isConnected && args[0] === '!') window.npcMarkers.push(args);
      return text.apply(this, args);
    };
  });
  await setup(page);
  await page.goto(origin);
  await page.locator('input[name="username"]').fill('tester');
  await page.locator('input[name="password"]').fill('test-password');
  await page.locator('.auth-submit').click();
  await page.locator('.map-card').waitFor({ state: 'visible' });
  await page.locator('.map-loading').waitFor({ state: 'hidden' });
  return { page, commands, emit, spawn, stopSpawns: () => { spawnOnLoad = false; } };
}

test('built app renders all six layers from a protocol event, uses facing, and clicks visible pixels or the name', async t => {
  const { page, commands, spawn, emit } = await worldPage(t);
  await page.waitForFunction(() => window.npcDraws.length === 6);
  const down = await page.evaluate(() => window.npcDraws.map(call => call.slice(1, 5)));
  assert.deepEqual(down[0], [0, 0, 64, 64]);
  assert.deepEqual(down[1], [0, 0, 32, 32]);
  assert.equal(await page.evaluate(() => window.npcMarkers.length), 0);
  if (process.env.NPC_TEST_SCREENSHOT) await page.screenshot({ path: process.env.NPC_TEST_SCREENSHOT });
  spawn(154, 4);
  await page.waitForFunction(() => window.npcDraws.length === 6 && window.npcDraws[0][2] === 256);
  // Find both a visibly painted point and a transparent point outside the old
  // marker but inside the sprite bounds, independent of the renderer's hit map.
  const points = await page.evaluate(() => {
    const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
    const calls = window.npcDraws;
    const mask = document.createElement('canvas'); mask.width = canvas.width; mask.height = canvas.height;
    const ctx = mask.getContext('2d');
    for (const call of calls) ctx.drawImage(...call);
    const data = ctx.getImageData(0, 0, mask.width, mask.height).data;
    const [,,,,, x, y, w, h] = calls[0];
    let opaque, transparent;
    for (let py = y + 5; py < y + h - 8; py++) for (let px = x; px < x + w; px++) {
      const alpha = data[(py * mask.width + px) * 4 + 3];
      if (!opaque && alpha === 255) opaque = { x: rect.left + px + .5, y: rect.top + py + .5 };
      if (!transparent && alpha === 0 && px < x + 8 && py > y + 20) transparent = { x: rect.left + px + .5, y: rect.top + py + .5 };
    }
    return { opaque, transparent };
  });
  assert.ok(points.opaque); assert.ok(points.transparent);
  await page.mouse.click(points.transparent.x, points.transparent.y);
  await page.waitForFunction(() => window.npcMarkers.length === 0);
  await page.waitForTimeout(100);
  assert.equal(commands.filter(c => c.type === 'talk').length, 0);
  assert.ok(commands.some(c => c.type === 'walk'));
  await page.mouse.click(points.opaque.x, points.opaque.y);
  await page.locator('.dialog-card').waitFor({ state: 'visible' });
  assert.deepEqual(commands.find(c => c.type === 'talk'), { type: 'talk', id: 5200 });
  emit({ type: 'dialog', id: 5200, closed: true });
  await page.locator('.dialog-card').waitFor({ state: 'hidden' });
  const name = await page.evaluate(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const top = Math.min(...window.npcDraws.map(call => call[6]));
    return { x: rect.left + window.npcDraws[0][5] + 32, y: rect.top + top - 8 };
  });
  await page.mouse.click(name.x, name.y);
  await page.locator('.dialog-card').waitFor({ state: 'visible' });
  assert.equal(commands.filter(c => c.type === 'talk').length, 2);
  // New diagonal protocol directions must not hide the existing simple avatar.
  emit({ type: 'entity', id: 5300, kind: 'player', job: 0, x: 32, y: 25, facing: 'upright' });
  await page.waitForFunction(() => window.actorDraws.length === 2);
});

test('built app replaces graphics on job updates and keeps a clickable fallback when one image is missing', async t => {
  let failures = 0;
  const { page, spawn, commands } = await worldPage(t, { job: 200, setup: async page => {
    await page.route('**/assets/graphics/sprites/equipment/feet/boots-female.png', route => {
      failures++; return route.fulfill({ status: 404, body: '' });
    });
  } });
  await page.waitForFunction(() => window.npcDraws.length === 1);
  const crop = await page.evaluate(() => window.npcDraws[0].slice(1, 5));
  assert.deepEqual(crop, [250, 0, 50, 80]);
  spawn(154);
  await page.waitForFunction(() => window.npcDraws.length === 0 && window.npcMarkers.length === 1);
  await page.waitForTimeout(250);
  assert.equal(failures, 1);
  spawn(154);
  await page.waitForTimeout(150);
  assert.equal(failures, 1);
  const point = await page.evaluate(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return { x: rect.left + window.npcMarkers[0][1], y: rect.top + window.npcMarkers[0][2] - 5 };
  });
  await page.mouse.click(point.x, point.y);
  await page.locator('.dialog-card').waitFor({ state: 'visible' });
  assert.deepEqual(commands.find(c => c.type === 'talk'), { type: 'talk', id: 5200 });
});

for (const action of ['remove', 'world']) test(`late sprite downloads cannot restore an NPC after ${action}`, async t => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  let requested;
  const started = new Promise(resolve => { requested = resolve; });
  const { page, emit, stopSpawns } = await worldPage(t, { job: 200, setup: async page => {
    await page.route('**/assets/graphics/sprites/npcs/2006__npcs.png', async route => {
      requested(); await delayed; await route.continue();
    });
  } });
  await started;
  stopSpawns();
  const downloaded = page.waitForResponse('**/assets/graphics/sprites/npcs/2006__npcs.png');
  emit(action === 'remove' ? { type: 'remove', id: 5200 } :
    { type: 'world', map: 'npc-test', x: 30, y: 25, id: 42, name: 'Aria' });
  release();
  await (await downloaded).finished();
  await page.locator('.map-loading').waitFor({ state: 'hidden' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.npcDraws.length + window.npcMarkers.length), 0);
});
