import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Resolve the same Miniflare installation that Wrangler uses.
const requireFromWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare } = requireFromWrangler('miniflare');

test('Worker preview serves static assets over HTTP', { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'card-gallery-worker-'));
  let runtime;

  t.after(async () => {
    try {
      await runtime?.dispose();
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const assets = join(root, 'assets');
  const cardId = '测试 卡 100%';
  const imageDirectory = join(assets, 'images', cardId);
  const imagePath = `/images/${encodeURIComponent(cardId)}/front.png`;
  const html = `<!doctype html><html lang="zh-CN"><title>卡片预览</title><img src="${imagePath}" alt="测试卡片"></html>`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=',
    'base64',
  );

  await mkdir(imageDirectory, { recursive: true });
  await writeFile(join(assets, 'index.html'), html);
  await writeFile(join(imageDirectory, 'front.png'), png);

  runtime = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    cf: false,
    telemetry: { enabled: false },
    logRequests: false,
    workers: [{
      config: {
        name: '',
        compatibilityDate: '2026-10-23',
        manifest: {
          mainModule: 'index.mjs',
          modulesRoot: root,
          modules: {
            'index.mjs': {
              type: 'esm',
              contents: 'export default { fetch() { return new Response("Unexpected user worker fallback", { status: 500 }); } };',
            },
          },
        },
        assets: { directory: assets },
      },
      dev: { rootPath: root },
    }],
  });

  const origin = await runtime.ready;

  async function request(path) {
    const response = await fetch(new URL(path, origin), {
      redirect: 'error',
      headers: { connection: 'close' },
      signal: AbortSignal.any([t.signal, AbortSignal.timeout(10_000)]),
    });
    // Consume every response, including errors, before assertions or cleanup.
    const body = Buffer.from(await response.arrayBuffer());
    return { response, body };
  }

  const home = await request('/');
  assert.equal(home.response.status, 200);
  assert.match(home.response.headers.get('content-type') ?? '', /^text\/html(?:;|$)/);
  assert.equal(home.body.toString('utf8'), html);

  const image = await request(imagePath);
  assert.equal(image.response.status, 200);
  assert.match(image.response.headers.get('content-type') ?? '', /^image\/png(?:;|$)/);
  assert.deepEqual(image.body, png);

  const missing = await request('/missing.png');
  assert.equal(missing.response.status, 404);
});
