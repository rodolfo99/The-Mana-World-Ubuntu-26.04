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

async function loginPage(t, reply) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  t.after(() => page.close());
  await page.routeWebSocket('**/game', socket => {
    socket.onMessage(message => {
      // Delayed replies ensure no click or keypress can trigger the UI refresh.
      setTimeout(() => reply(socket, JSON.parse(String(message))), 75);
    });
  });
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
