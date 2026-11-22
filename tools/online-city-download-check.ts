import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { downloadOnlineCity, onlineCitySources } from '../src/online-city-download';

const hits: string[] = [];
const server = createServer(async (req, res) => {
  const route = req.url!;
  hits.push(route);
  if (route !== '/no-headers') {
    res.writeHead(200, { 'Content-Length': 12 });
    res.flushHeaders();
  }
  if (route === '/no-headers') return;
  if (route === '/no-body') {
    res.write('one');
    return;
  }
  for (const part of ['one', 'two', 'six', 'ten']) {
    res.write(part);
    if (route === '/steady') await delay(125);
  }
  res.end();
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const messages: string[] = [];
  const run = (paths: string[], signal = new AbortController().signal) =>
    downloadOnlineCity(paths.map(path => base + path), signal, message => messages.push(message), 320);

  const revision = 'a'.repeat(40);
  assert.deepEqual(onlineCitySources('/viewer/', revision, 'https://github.com/example/viewer'), [
    `/viewer/online-city/map.cs2map.enc?v=${revision}`,
    `https://raw.githubusercontent.com/example/viewer/${revision}/public/online-city/map.cs2map.enc`,
  ]);
  const expected = 'onetwosixten';
  assert.equal(Buffer.from(await run(['/steady'])).toString(), expected);
  assert.ok(messages.includes('Downloading map… 25%') && messages.includes('Downloading map… 100%'));

  assert.equal(Buffer.from(await run(['/no-headers', '/backup'])).toString(), expected);
  assert.equal(Buffer.from(await run(['/no-body', '/backup'])).toString(), expected);
  assert.deepEqual(hits, ['/steady', '/no-headers', '/backup', '/no-body', '/backup']);
  assert.equal(messages.filter(message => message === 'Retrying download…').length, 2);

  await assert.rejects(run(['/no-headers', '/no-body']), { name: 'TimeoutError' });
  const request = new AbortController();
  const cancelled = run(['/no-headers', '/backup'], request.signal);
  request.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(hits.filter(path => path === '/backup').length, 2);
  console.log('Online city download checks passed.');
} finally {
  server.closeAllConnections();
  server.close();
}
