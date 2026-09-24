import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createGameServer } from '../backend/server.mjs';

const port = Number(process.env.GAME_WEB_TEST_PORT ?? 31320);
let browser, server;

before(async () => {
  server = createGameServer({ port });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'],
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function loginPage(t, reply, setup = async () => {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  t.after(() => page.close());
  await page.routeWebSocket('**/game', socket => {
    socket.onMessage(message => {
      // Delayed replies ensure no click or keypress can trigger the UI refresh.
      setTimeout(() => reply(socket, JSON.parse(String(message))), 75);
    });
  });
  await setup(page);
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('input[name="username"]').fill('tester');
  await page.locator('input[name="password"]').fill('test-password');
  await page.locator('.auth-submit').click();
  return page;
}

test('delayed WebSocket login and map loading update the screen without another click', { timeout: 20000 }, async t => {
  let loaded = false;
  const page = await loginPage(t, (socket, command) => {
    if (command.type === 'login') socket.send(JSON.stringify({ type: 'characters', characters: [
      { id: 1001, name: 'Aria', slot: 0, level: 1, hp: 10, maxHp: 10, sex: 'F' },
    ] }));
    if (command.type === 'choose') socket.send(JSON.stringify({ type: 'world', map: '029-2', x: 20, y: 20, id: 42, name: 'Aria' }));
    if (command.type === 'loaded') loaded = true;
  });
  await page.locator('.character-screen').waitFor({ state: 'visible' });
  await page.locator('.character-choice').click();
  await page.locator('.map-card').waitFor({ state: 'visible' });
  await page.locator('.map-loading').waitFor({ state: 'hidden', timeout: 12000 });
  await page.waitForFunction(() => document.querySelector('.footer-status')?.textContent?.includes('Estás en'));
  // The loaded command is scheduled independently from the DOM assertion.
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(loaded, true);
});

test('a rejected login shows its reason beside the form and permits retry', { timeout: 10000 }, async t => {
  const page = await loginPage(t, socket => socket.send(JSON.stringify({
    type: 'error', message: 'La cuenta no existe. Usa Crear cuenta para registrarte.',
  })));
  await page.locator('.auth-status').filter({ hasText: 'La cuenta no existe' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.auth-submit')?.textContent?.includes('Conectando'));
  await page.locator('input[name="password"]').fill('another-password');
  assert.equal(await page.locator('.auth-submit').isEnabled(), true);
});

test('a WebSocket disconnection releases the login button', { timeout: 10000 }, async t => {
  const page = await loginPage(t, socket => socket.close());
  await page.locator('.auth-status').filter({ hasText: 'Se perdió la conexión' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.auth-submit')?.textContent?.includes('Conectando'));
});

async function worldPage(t, onCommand = () => {}) {
  const commands = [];
  const page = await loginPage(t, (socket, command) => {
    commands.push(command);
    if (command.type === 'login') socket.send(JSON.stringify({ type: 'world', map: 'pointer-test', x: 30, y: 25, id: 42, name: 'Aria' }));
    if (command.type === 'loaded') socket.send(JSON.stringify({ type: 'entity', id: 5200, kind: 'npc', x: 28, y: 25, name: 'Nina' }));
    if (command.type === 'talk') socket.send(JSON.stringify({ type: 'dialog', id: 5200, text: 'Hola, viajero.', choices: ['Sí', '', 'No'] }));
    onCommand(socket, command);
  }, async page => {
    await page.route('**/assets/maps/pointer-test.tmx', route => route.fulfill({
      contentType: 'application/xml',
      body: '<map width="80" height="60" tilewidth="32" tileheight="32"><properties><property name="name" value="Prueba del ratón"/></properties></map>',
    }));
  });
  await page.locator('.map-card').waitFor({ state: 'visible' });
  await page.locator('.map-loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.footer-status')?.textContent?.includes('Estás en'));
  // Wait for the delayed entity reply and the next painted frame.
  await page.waitForTimeout(200);
  return { page, commands };
}

async function canvasPoint(page, dx = 0, dy = 0) {
  return page.locator('canvas').evaluate((canvas, { dx, dy }) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (canvas.clientWidth / 2 + dx) * rect.width / canvas.clientWidth,
      y: rect.top + (canvas.clientHeight / 2 + dy) * rect.height / canvas.clientHeight };
  }, { dx, dy });
}

test('ground beside an NPC moves without opening its dialogue', { timeout: 10000 }, async t => {
  const { page, commands } = await worldPage(t);
  const point = await canvasPoint(page, -64 + 24, 0);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(160);
  const action = commands.find(command => command.type === 'walk' || command.type === 'talk');
  assert.deepEqual(action, { type: 'walk', x: 29, y: 25 });
});

test('scaled canvas maps the pointer to the rendered world coordinates', { timeout: 10000 }, async t => {
  const { page, commands } = await worldPage(t);
  await page.locator('canvas').evaluate(canvas => {
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = 'scale(0.75)';
  });
  const point = await canvasPoint(page, 64, 0);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(160);
  assert.deepEqual(commands.find(command => command.type === 'walk'), { type: 'walk', x: 32, y: 25 });
});

test('NPC labels are clickable and blank choices retain their server index', { timeout: 10000 }, async t => {
  const { page, commands } = await worldPage(t);
  const point = await canvasPoint(page, -64, -34);
  await page.mouse.click(point.x, point.y);
  await page.locator('.dialog-card').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.dialog-actions button').count(), 3);
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.waitForTimeout(160);
  assert.deepEqual(commands.find(command => command.type === 'choice'), { type: 'choice', id: 5200, index: 3 });
});

test('information overlays allow map clicks and an active dialogue blocks them', { timeout: 10000 }, async t => {
  const { page, commands } = await worldPage(t);
  const box = await page.locator('.map-card').boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.waitForTimeout(160);
  assert.equal(commands.filter(command => command.type === 'walk').length, 1);
  const npc = await canvasPoint(page, -64, 0);
  await page.mouse.click(npc.x, npc.y);
  await page.locator('.dialog-card').waitFor({ state: 'visible' });
  const ground = await canvasPoint(page, 64, -60);
  await page.mouse.click(ground.x, ground.y);
  await page.waitForTimeout(160);
  assert.equal(commands.filter(command => command.type === 'walk').length, 1);
});

test('real starting map allows arrows and mouse movement out of bed', { timeout: 20000 }, async t => {
  const commands = [];
  const page = await loginPage(t, (socket, command) => {
    commands.push(command);
    if (command.type === 'login') socket.send(JSON.stringify({ type: 'world', map: '029-2', x: 22, y: 24, id: 42, name: 'Aria' }));
    if (command.type === 'walk') socket.send(JSON.stringify({ type: 'position', x: command.x, y: command.y }));
  });
  await page.waitForFunction(() => document.querySelector('.footer-status')?.textContent?.includes('Estás en'), { timeout: 12000 });
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => document.querySelector('.footer-status')?.textContent?.includes('no es transitable'));
  assert.equal(commands.some(c => c.type === 'walk'), false);
  await page.waitForTimeout(160);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.map-card')?.textContent?.includes('23, 24'));
  await page.waitForTimeout(160);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('.map-card')?.textContent?.includes('23, 25'));
  await page.waitForTimeout(300);
  const point = await canvasPoint(page, 32, 0);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('.map-card')?.textContent?.includes('24, 25'));
  assert.deepEqual(commands.filter(c => c.type === 'walk'), [
    { type: 'walk', x: 23, y: 24 }, { type: 'walk', x: 23, y: 25 }, { type: 'walk', x: 24, y: 25 },
  ]);
});

test('close2 keeps all NPC lines visible until Close and then releases arrows and mouse', { timeout: 12000 }, async t => {
  let locked = true;
  const { page, commands } = await worldPage(t, (socket, command) => {
    if (command.type === 'choice') {
      for (const text of ['Primera línea en español.', 'Segunda línea: vuelve a caminar.'])
        socket.send(JSON.stringify({ type: 'dialog', id: 5200, text }));
      socket.send(JSON.stringify({ type: 'dialog', id: 5200, close: true }));
    }
    if (command.type === 'closeNpc') locked = false;
    if (command.type === 'walk' && !locked)
      socket.send(JSON.stringify({ type: 'position', x: command.x, y: command.y }));
  });
  const npc = await canvasPoint(page, -64, 0);
  await page.mouse.click(npc.x, npc.y);
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).waitFor();
  assert.equal(await page.locator('.dialog-text').textContent(), 'Primera línea en español.\nSegunda línea: vuelve a caminar.');
  await page.keyboard.press('ArrowRight');
  assert.equal(commands.some(c => c.type === 'walk'), false);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('.dialog-card').waitFor({ state: 'hidden' });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.map-card')?.textContent?.includes('31, 25'));
  const point = await canvasPoint(page, 32, 0);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector('.map-card')?.textContent?.includes('32, 25'));
  assert.equal(commands.filter(c => c.type === 'closeNpc').length, 1);
});

test('Escape cancels an NPC menu and restores map focus without moving while typing', { timeout: 10000 }, async t => {
  const { page, commands } = await worldPage(t);
  const npc = await canvasPoint(page, -64, 0);
  await page.mouse.click(npc.x, npc.y);
  await page.locator('.dialog-card').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.dialog-card').waitFor({ state: 'hidden' });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(160);
  assert.equal(commands.filter(c => c.type === 'closeNpc').length, 1);
  assert.equal(commands.filter(c => c.type === 'walk').length, 1);
  await page.getByRole('textbox', { name: 'Mensaje para el chat' }).fill('Hola');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(160);
  assert.equal(commands.filter(c => c.type === 'walk').length, 1);
});
