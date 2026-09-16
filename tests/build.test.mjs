import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import { buildSite } from '../scripts/build.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const card = (id, image) => ({ id, name: '测试卡片', bank: '测试银行', type: 'credit', image });

async function fixture(t, cards) {
  const root = await mkdtemp(resolve(tmpdir(), 'card-gallery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['index.html', 'app.js', 'styles.css', '.nojekyll', 'assets/card-mark.svg', 'assets/logos']) {
    await mkdir(dirname(resolve(root, file)), { recursive: true });
    await cp(resolve(projectRoot, file), resolve(root, file), { recursive: true });
  }
  await writeFile(resolve(root, 'cards.js'), `window.CARD_GALLERY_DATA = ${JSON.stringify(cards)};\n`);
  return root;
}

async function imageServer(t) {
  const png = await sharp({ create: { width: 2000, height: 1200, channels: 4, background: '#2288cc80' } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 400, height: 250, channels: 3, background: '#2288cc' } }).jpeg().toBuffer();
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/image.png' }).end();
    } else if (request.url === '/image.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    } else if (request.url === '/image.jpg') {
      response.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(jpeg);
    } else if (request.url === '/html') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>图片不存在</html>');
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done, reject) => {
    server.close(error => error ? reject(error) : done());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('远程 PNG/JPEG 与重定向可生成独立站点，源码不变，图片保持比例及透明度', async t => {
  const url = await imageServer(t);
  const root = await fixture(t, [card('png', `${url}/redirect`), card('jpeg', `${url}/image.jpg`)]);
  const source = await readFile(resolve(root, 'cards.js'), 'utf8');
  await buildSite({ root, log() {} });

  assert.equal(await readFile(resolve(root, 'cards.js'), 'utf8'), source);
  const context = { window: {} };
  runInNewContext(await readFile(resolve(root, 'public/cards.js'), 'utf8'), context);
  const built = Array.from(context.window.CARD_GALLERY_DATA);
  assert.deepEqual(built.map(item => item.id), ['png', 'jpeg']);
  for (const item of built) {
    assert.match(item.image, /^\.\/cards\/\d+\.webp$/);
    const metadata = await sharp(resolve(root, 'public', item.image)).metadata();
    assert.equal(metadata.format, 'webp');
    if (item.id === 'png') {
      assert.equal(metadata.width, 1600);
      assert.equal(metadata.height, 960);
      assert.equal(metadata.hasAlpha, true);
    } else {
      assert.equal(metadata.width, 400);
      assert.equal(metadata.height, 250);
    }
  }
  assert.deepEqual((await readdir(resolve(root, 'public'))).sort(), ['.nojekyll', 'app.js', 'assets', 'cards', 'cards.js', 'index.html', 'styles.css']);
  await assert.rejects(readFile(resolve(root, 'public/assets/collection.webp')), { code: 'ENOENT' });

  // 删除卡片后重新构建，旧卡面必须从发布目录消失。
  await writeFile(resolve(root, 'cards.js'), 'window.CARD_GALLERY_DATA = [];\n');
  await buildSite({ root, log() {} });
  assert.deepEqual(await readdir(resolve(root, 'public/cards')), []);
});

test('现有本地示例仍可构建，但不会把原始卡面目录发布出去', async t => {
  const root = await fixture(t, [card('local', './assets/cards/local.webp')]);
  await mkdir(resolve(root, 'assets/cards'));
  await sharp({ create: { width: 400, height: 250, channels: 3, background: '#2288cc' } })
    .webp()
    .toFile(resolve(root, 'assets/cards/local.webp'));
  await buildSite({ root, log() {} });
  assert.equal((await sharp(resolve(root, 'public/cards/1.webp')).metadata()).format, 'webp');
  await assert.rejects(readdir(resolve(root, 'public/assets/cards')), { code: 'ENOENT' });
});

test('下载失败或返回网页时指出具体卡片，并清理未完成的发布目录', async t => {
  const url = await imageServer(t);
  for (const path of ['/missing', '/html']) {
    const root = await fixture(t, [card('ok', `${url}/image.jpg`), card('broken', `${url}${path}`)]);
    await assert.rejects(buildSite({ root, log() {} }), /卡片「broken」处理失败/);
    await assert.rejects(readdir(resolve(root, 'public')), { code: 'ENOENT' });
  }
});

test('重复 id 在下载前报错', async t => {
  const root = await fixture(t, [card('same', 'https://example.com/one.png'), card('same', 'https://example.com/two.png')]);
  await assert.rejects(buildSite({ root, log() {} }), /id「same」重复/);
});
