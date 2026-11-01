import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const concepts = [
  { id: 'state', title: 'State', description: '화면의 쓰기 가능한 값입니다. 값이 바뀌면 의존하는 계산과 조회가 함께 갱신됩니다.' },
  { id: 'query', title: 'Query', description: '입력에 맞춰 데이터를 조회합니다. 늦게 도착한 응답과 실패 후 이전 결과를 관리합니다.' },
  { id: 'action', title: 'Action', description: '이벤트에서 시작하는 동작입니다. State 변경과 Query 실행을 순서대로 연결합니다.' },
  { id: 'component', title: 'Component', description: '입력과 slot을 받아 화면을 구성합니다. repeat의 각 항목은 독립된 수명을 가집니다.' },
];
export async function startPlayground({ port = 4173, host = '127.0.0.1' } = {}) {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./app.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  const [html, css] = await Promise.all(['index.html', 'style.css'].map(name => readFile(new URL(name, import.meta.url))));
  const assets = new Map([['/', ['text/html; charset=utf-8', html]], ['/style.css', ['text/css; charset=utf-8', css]], ['/app.js', ['text/javascript; charset=utf-8', bundle.outputFiles[0].contents]]]);
  const timers = new Set();
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Invalid request URL'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (url.pathname === '/api/concepts') {
      const delay = Number(url.searchParams.get('delay') ?? 0);
      if (!Number.isFinite(delay) || delay < 0 || delay > 3000) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'delay must be between 0 and 3000ms' })); return; }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (res.destroyed) return;
        const search = (url.searchParams.get('search') ?? '').toLowerCase();
        const fail = url.searchParams.get('fail') === 'true';
        res.writeHead(fail ? 503 : 200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(fail ? { message: '플레이그라운드의 의도적인 Query 오류입니다.' } : { items: concepts.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(search)) }));
      }, delay);
      timers.add(timer); res.on('close', () => { clearTimeout(timer); timers.delete(timer); }); return;
    }
    const asset = assets.get(url.pathname);
    if (!asset) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': asset[0] }); res.end(req.method === 'HEAD' ? undefined : asset[1]);
  });
  await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, host, ok); });
  return { server, url: `http://${host}:${server.address().port}`, close: () => new Promise((ok, reject) => {
    for (const timer of timers) clearTimeout(timer); timers.clear();
    server.close(error => error ? reject(error) : ok()); server.closeAllConnections();
  }) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be an integer between 0 and 65535');
  const app = await startPlayground({ port });
  console.log(`Viewstem playground: ${app.url}\n종료: Ctrl+C`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
}
