import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createGameServer } from '../backend/server.mjs';

const port = Number(process.env.GAME_WEB_FORMAT_TEST_PORT ?? 31324);
let browser, server;
before(async () => {
  server = createGameServer({ port });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function world(t, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  t.after(() => page.close());
  let connection;
  const commands = [];
  await page.route('**/assets/maps/format-test.tmx', route => route.fulfill({ contentType: 'application/xml',
    body: '<map width="80" height="60" tilewidth="32" tileheight="32"><properties><property name="name" value="Plaza principal de Candor"/></properties></map>' }));
  await page.routeWebSocket('**/game', socket => {
    connection = socket;
    socket.onMessage(message => {
      const command = JSON.parse(String(message));
      commands.push(command);
      if (command.type === 'login') socket.send(JSON.stringify({ type: 'world', map: 'format-test', x: 30, y: 25, id: 42, name: 'Aria' }));
    });
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('[name=username]').fill('tester');
  await page.locator('[name=password]').fill('test-password');
  await page.locator('.auth-submit').click();
  await page.locator('.map-card').waitFor();
  await page.locator('.map-loading').waitFor({ state: 'hidden' });
  return { page, commands, send: event => connection.send(JSON.stringify(event)) };
}

test('NPC markup renders as safe styled labels and preserves sparse menu indices', { timeout: 15000 }, async t => {
  const { page, commands, send } = await world(t);
  send({ type: 'inventory', items: [{ id: 501, slot: 2, amount: 1, name: 'Cactus Drink' }] });
  send({ type: 'dialog', id: 900, text: '##BAtención##b: ##3azul##0. [@@501|@@] [@@999|@@] @@https://example.org/help|Ayuda@@ @@javascript:alert(1)|<img src=x onerror="window.badFormat=true">@@',
    choices: ['##BPrimera##b', '', '@@https://example.org|Tercera@@'] });
  const dialog = page.locator('.dialog-card');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Atención: azul\. \[Cactus Drink\] \[Objeto 999\] Ayuda/);
  assert.doesNotMatch(await dialog.innerText(), /##|@@/);
  assert.equal(await dialog.locator('a').count(), 1);
  assert.equal(await dialog.locator('a').innerText(), 'Ayuda');
  assert.equal(await dialog.locator('a').getAttribute('href'), 'https://example.org/help');
  assert.equal(await dialog.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.badFormat), undefined);
  assert.equal(await dialog.locator('span').filter({ hasText: /^Atención$/ }).evaluate(el => getComputedStyle(el).fontWeight), '700');
  assert.equal(await dialog.locator('.dialog-actions a').count(), 0);
  await dialog.getByRole('button', { name: 'Tercera', exact: true }).click();
  await page.waitForTimeout(50);
  assert.deepEqual(commands.find(command => command.type === 'choice'), { type: 'choice', id: 900, index: 3 });
});

test('tutorial adaptation applies to NPC display but leaves the same player message intact', { timeout: 15000 }, async t => {
  const { page, send } = await world(t);
  const native = 'Una vez que dejemos de hablar, haga doble clic en la ropa para equipar.';
  send({ type: 'chat', from: 'Jugador de prueba', text: native });
  send({ type: 'dialog', id: 901, text: native });
  send({ type: 'dialog', id: 901, close: true });
  await page.locator('.dialog-text').filter({ hasText: 'pulsa Equipar' }).waitFor();
  assert.match(await page.locator('.message-list').innerText(), /haga doble clic/);
  assert.ok((await page.locator('.message-list').textContent()).includes(`Jugador de prueba ${native}`));
  assert.doesNotMatch(await page.locator('.dialog-text').innerText(), /doble clic/);
});

test('mobile map and selected target panels remain separate and inside the viewport', { timeout: 15000 }, async t => {
  const { page, send } = await world(t, { width: 390, height: 844 });
  send({ type: 'entity', id: 800, kind: 'monster', job: 0, x: 31, y: 25, name: 'Criatura de las afueras de Candor' });
  await page.waitForTimeout(100);
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2 + 32, canvas.y + canvas.height / 2);
  await page.locator('.target-card').waitFor();
  const map = await page.locator('.map-card').boundingBox();
  const target = await page.locator('.target-card').boundingBox();
  const overlap = map.x < target.x + target.width && map.x + map.width > target.x && map.y < target.y + target.height && map.y + map.height > target.y;
  assert.equal(overlap, false);
  assert.ok(target.x >= 0 && target.x + target.width <= 390);
  assert.ok(map.x >= 0 && map.x + map.width <= 390);
});

test('long dialogue at 1024×600 keeps its closing action reachable inside the screen', { timeout: 15000 }, async t => {
  const { page, send } = await world(t, { width: 1024, height: 600 });
  send({ type: 'dialog', id: 902, text: 'Una explicación larga con tildes, árboles y compañeros. '.repeat(110) });
  send({ type: 'dialog', id: 902, close: true });
  const button = page.locator('.dialog-card').getByRole('button', { name: 'Cerrar', exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  assert.ok(box.y >= 64 && box.y + box.height <= 600, JSON.stringify(box));
  const overflow = await page.locator('.dialog-card').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false);
  await button.click();
  await page.locator('.dialog-card').waitFor({ state: 'hidden' });
});
