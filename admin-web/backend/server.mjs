import { createServer } from 'node:http';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = resolve(root, 'admin-web/dist/admin-web/browser');
const adminScript = resolve(root, 'scripts/admin.sh');
const binary = resolve(root, 'instalado/bin/tmwa-admin');
const config = resolve(root, 'sources/serverdata/login/conf/ladmin_local.conf');
const port = Number(process.env.ADMIN_WEB_PORT ?? 3010);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('ADMIN_WEB_PORT debe estar entre 1024 y 65535');
}
const origin = `http://127.0.0.1:${port}`;
let occupied = false;

export function buildCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Datos inválidos.');
  const account = () => {
    if (typeof input.account !== 'string' || !/^[a-zA-Z0-9_.-]{1,23}$/.test(input.account)) {
      throw new Error('Introduce un nombre de cuenta de hasta 23 caracteres ASCII (letras, números, _, . o -).');
    }
    return input.account;
  };
  const integer = (field, min, max) => {
    const value = input[field];
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${field}: indica un número entero entre ${min} y ${max}.`);
    }
    return value;
  };
  switch (input.action) {
    case 'list': {
      const start = integer('startId', 0, 2147483400);
      const end = integer('endId', start, Math.min(start + 200, 2147483600));
      return `list ${start} ${end}`;
    }
    case 'listgm': return 'listgm';
    case 'getcount': return 'getcount';
    case 'id': return `id ${account()}`;
    case 'info': return `info ${integer('accountId', 1, 2147483647)}`;
    case 'gm': return `gm ${account()} ${integer('level', 0, 99)}`;
    case 'block': return `block ${account()}`;
    case 'unblock': return `unblock ${account()}`;
    case 'kami': {
      if (typeof input.message !== 'string' || input.message.length < 1 ||
          input.message.length > 160 || !/^[\x20-\x7e]+$/.test(input.message)) {
        throw new Error('El aviso debe tener entre 1 y 160 caracteres ASCII imprimibles.');
      }
      return `kami ${input.message}`;
    }
    default: throw new Error('Acción no permitida.');
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function loginAvailable() {
  return new Promise(done => {
    const socket = connect({ host: '127.0.0.1', port: 6901 });
    socket.setTimeout(700);
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => done(false));
    socket.once('timeout', () => { socket.destroy(); done(false); });
  });
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) { reject(new Error('Solicitud demasiado grande.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolveBody(JSON.parse(body)); } catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function execute(command) {
  return new Promise((done, fail) => {
    const child = spawn(adminScript, [], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) fail(error);
      else done(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('tmwa-admin no respondió en 15 segundos.'));
    }, 15000);
    const collect = chunk => {
      output += chunk.toString('utf8');
      if (output.length > 262144) {
        child.kill('SIGKILL');
        finish(new Error('Respuesta demasiado larga. Reduce la consulta.'));
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', error => finish(new Error(`No se pudo iniciar tmwa-admin: ${error.message}`)));
    child.once('close', code => {
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (code !== 0 || /Error at login:|Impossible to have a connection|Remote administration has been disconnected/i.test(clean)) {
        finish(new Error('No se pudo conectar con la administración. Comprueba que el servidor está encendido y configurado.'));
      } else if (!clean) {
        finish(new Error('tmwa-admin terminó sin respuesta.'));
      } else finish(null, clean);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(`${command}\n`);
  });
}

function staticFile(req, res, pathname) {
  if (!existsSync(webRoot)) return json(res, 503, { error: 'Falta compilar Angular: ejecuta ./scripts/admin-web.sh.' });
  let relative;
  try { relative = decodeURIComponent(pathname).slice(1); } catch { return json(res, 400, { error: 'Ruta inválida.' }); }
  if (relative.split('/').some(part => part === '..' || part.startsWith('.'))) return json(res, 403, { error: 'Ruta inválida.' });
  const file = resolve(webRoot, relative || 'index.html');
  if (file !== webRoot && !file.startsWith(webRoot + sep)) return json(res, 403, { error: 'Ruta inválida.' });
  let target = file;
  if (!existsSync(target) || !statSync(target).isFile()) {
    if (extname(relative)) return json(res, 404, { error: 'Archivo no encontrado.' });
    target = join(webRoot, 'index.html');
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(target).pipe(res);
}

export function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: 'Acceso local solamente.' });
  const pathname = new URL(req.url ?? '/', origin).pathname;
  if (req.method === 'GET' && pathname === '/api/status') {
    loginAvailable().then(login => json(res, 200, {
      installed: existsSync(binary), configured: existsSync(config), login,
      ready: existsSync(binary) && existsSync(config) && login
    }));
    return;
  }
  if (req.method === 'POST' && pathname === '/api/command') {
    if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) {
      return json(res, 403, { error: 'Solicitud de origen no autorizado.' });
    }
    if (occupied) return json(res, 429, { error: 'Hay otra operación en curso. Espera un momento.' });
    occupied = true;
    (async () => {
      try {
        const input = await readBody(req);
        const command = buildCommand(input);
        if (!existsSync(binary) || !existsSync(config)) throw new Error('Ejecuta primero ./scripts/instalar.sh.');
        json(res, 200, { output: await execute(command) });
      } catch (error) {
        if (!res.destroyed) json(res, error.message?.startsWith('tmwa-admin') ? 504 : 400, { error: error.message });
      } finally { occupied = false; }
    })();
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') return staticFile(req, res, pathname);
  json(res, 404, { error: 'Ruta no encontrada.' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(handler).listen(port, '127.0.0.1', () => {
    console.log(`Administración local: ${origin}`);
  });
}
