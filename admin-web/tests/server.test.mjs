import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(project, '..');

test('el panel solo acepta órdenes validadas desde su origen local', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tmw-admin-test-'));
  const fixture = join(temporary, 'project');
  const port = await new Promise(resolvePort => {
    const probe = createHttpServer().listen(0, '127.0.0.1', () => {
      const free = probe.address().port;
      probe.close(() => resolvePort(free));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  let child;
  try {
    await mkdir(join(fixture, 'admin-web/backend'), { recursive: true });
    await mkdir(join(fixture, 'admin-web/dist/admin-web/browser'), { recursive: true });
    await mkdir(join(fixture, 'scripts'), { recursive: true });
    await mkdir(join(fixture, 'instalado/bin'), { recursive: true });
    await mkdir(join(fixture, 'sources/serverdata/login/conf'), { recursive: true });
    await cp(join(project, 'backend/server.mjs'), join(fixture, 'admin-web/backend/server.mjs'));
    await cp(join(repo, 'scripts/admin.sh'), join(fixture, 'scripts/admin.sh'));
    await writeFile(join(fixture, 'sources/serverdata/login/conf/ladmin_local.conf'), 'mock test only\n');
    await writeFile(join(fixture, 'admin-web/dist/admin-web/browser/index.html'), '<p>Panel de prueba</p>');
    const mock = join(fixture, 'instalado/bin/tmwa-admin');
    await writeFile(mock, '#!/bin/sh\nIFS= read -r command\nprintf "RESPUESTA: %s\\n" "$command"\n');
    await chmod(mock, 0o755);
    child = spawn(process.execPath, [join(fixture, 'admin-web/backend/server.mjs')], {
      env: { ...process.env, ADMIN_WEB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('Servidor no inició.')), 5000);
      child.stdout.on('data', data => {
        if (data.includes('Administración local:')) { clearTimeout(timer); resolveReady(); }
      });
      child.once('exit', code => { clearTimeout(timer); rejectReady(new Error(`Servidor terminó con código ${code}`)); });
    });
    const send = (path, method, body, headers = {}) => new Promise((resolveResponse, rejectResponse) => {
      const req = request(origin + path, { method, headers: {
        ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers
      } }, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolveResponse({ status: res.statusCode, data: text }));
      });
      req.on('error', rejectResponse);
      req.end(body ? JSON.stringify(body) : undefined);
    });
    const page = await send('/', 'GET');
    assert.equal(page.status, 200);
    assert.match(page.data, /Panel de prueba/);
    const allowed = await send('/api/command', 'POST', { action: 'id', account: 'rodo' });
    assert.equal(allowed.status, 200);
    assert.deepEqual(JSON.parse(allowed.data), { output: 'RESPUESTA: id rodo' });
    const unknown = await send('/api/command', 'POST', { action: 'delete', account: 'rodo' });
    assert.equal(unknown.status, 400);
    const injection = await send('/api/command', 'POST', { action: 'gm', account: 'rodo\nquit', level: 99 });
    assert.equal(injection.status, 400);
    const oversizedRange = await send('/api/command', 'POST', { action: 'list', startId: 2000000, endId: 2001000 });
    assert.equal(oversizedRange.status, 400);
    const nonAscii = await send('/api/command', 'POST', { action: 'kami', message: '¡Hola!' });
    assert.equal(nonAscii.status, 400);
    const foreign = await send('/api/command', 'POST', { action: 'block', account: 'rodo' }, { Origin: 'https://example.org' });
    assert.equal(foreign.status, 403);
    const rebinding = await send('/api/status', 'GET', null, { Host: 'example.org' });
    assert.equal(rebinding.status, 403);
  } finally {
    child?.kill();
    await rm(temporary, { recursive: true, force: true });
  }
});
