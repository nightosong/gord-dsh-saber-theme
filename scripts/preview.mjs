import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';

await build();
const fixture = await readFile(path.join(root, 'tests/fixture.html'));
const client = await readFile(path.join(root, 'lib/client.js'));
const server = http.createServer(async (req, res) => {
  if (/^\/client\.wallpaper-\d+\.js$/.test(req.url)) {
    try { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await readFile(path.join(root, 'lib', req.url.slice(1)))); }
    catch { res.writeHead(404).end(); }
    return;
  }
  const isClient = req.url === '/client.js';
  if (!isClient && req.url !== '/') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': isClient ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(isClient ? client : fixture);
});
server.listen(Number(process.env.PORT || 18478), '127.0.0.1', () => console.log(`Saber component fixture: http://127.0.0.1:${server.address().port}`));
