import http from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadPacketLengths } from './protocol.mjs';
import { GameSession } from './session.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.tmx', 'application/xml; charset=utf-8'], ['.tsx', 'application/xml; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);

function hostAllowed(req, port) {
  const host = req.headers.host;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function createGameServer({ root = projectRoot, port = 3020,
  ports = { login: 6901, char: 6122, map: 5122 } } = {}) {
  const lengths = loadPacketLengths(root);
  const assetRoot = join(root, 'sources/serverdata/client-data');
  const webRoot = join(root, 'game-web/dist/game-web/browser');
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const server = http.createServer((req, res) => {
    if (!hostAllowed(req, port)) { res.writeHead(403).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let url;
    try { url = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname); }
    catch { res.writeHead(400).end(); return; }
    const assets = url.startsWith('/assets/');
    const base = assets ? assetRoot : webRoot;
    const subpath = assets ? url.slice('/assets/'.length) : url === '/' ? 'index.html' : url.slice(1);
    const file = resolve(base, subpath);
    const rel = relative(base, file);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep) || !types.has(extname(file).toLowerCase())) {
      res.writeHead(404).end(); return;
    }
    try {
      const actualBase = realpathSync(base), actual = realpathSync(file);
      const checked = relative(actualBase, actual);
      if (checked === '..' || checked.startsWith(`..${sep}`) || !statSync(actual).isFile()) throw new Error('Ruta inválida');
      const size = statSync(actual).size;
      res.writeHead(200, { 'Content-Type': types.get(extname(actual).toLowerCase()),
        'Content-Length': size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': assets ? 'public, max-age=3600' : 'no-store' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(actual).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    if (req.url !== '/game' || !hostAllowed(req, port) ||
      (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const session = new GameSession(ws, lengths, ports);
    ws.on('message', (data, binary) => {
      try {
        if (binary) throw new Error('Se espera un mensaje JSON');
        session.command(JSON.parse(data.toString('utf8')));
      } catch (error) {
        session.emit({ type: 'error', message: String(error.message).slice(0, 180) });
      }
    });
    ws.on('close', () => session.close());
    ws.on('error', () => session.close());
  });
  server.on('close', () => wss.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.GAME_WEB_PORT ?? 3020);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('GAME_WEB_PORT inválido');
  if (!existsSync(join(projectRoot, 'game-web/dist/game-web/browser/index.html')))
    throw new Error('Falta compilar Angular: ejecuta ./scripts/juego-web.sh');
  createGameServer({ port }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Cliente web: http://127.0.0.1:${port}\n`);
  });
}
