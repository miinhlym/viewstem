import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';

/** Build the installed public package exports, then serve only the two example assets. */
export async function startExample({ port = 4174 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be an integer between 0 and 65535');
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./main.mjs', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    conditions: ['svelte', 'browser'],
    plugins: [{ name: 'example-svelte', setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const result = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected', dev: true });
        return { contents: result.js.code, loader: 'js', resolveDir: dirname(path) };
      });
    } }],
  });
  const html = await readFile(new URL('./index.html', import.meta.url));
  const assets = new Map([
    ['/', ['text/html; charset=utf-8', html]],
    ['/app.js', ['text/javascript; charset=utf-8', bundle.outputFiles[0].contents]],
  ]);
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400); response.end(); return; }
    const asset = assets.get(pathname);
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': asset[0] });
    response.end(request.method === 'HEAD' ? undefined : asset[1]);
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  let closing;
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => closing ??= new Promise((accept, reject) => {
      server.close(error => error ? reject(error) : accept());
      server.closeAllConnections();
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startExample({ port: Number(process.env.PORT ?? 4174) });
  console.log(`Viewstem Svelte example: ${app.url}\n종료: Ctrl+C`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    app.close().catch(error => { console.error(error); process.exitCode = 1; });
  });
}
