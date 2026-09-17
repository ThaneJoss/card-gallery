import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse, stringify } from 'yaml';
import { parseCards } from '../scripts/card-data.mjs';
import { buildSite } from '../scripts/build.mjs';
import { localizeCardImages, localizeCardsFile, remoteImageUrl } from '../.github/scripts/localize-card-images.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const card = (id, image) => ({ 编号: id, 名称: '测试卡片', 银行: '测试银行', 类型: '信用卡', 图片: image });
const png = await sharp({ create: { width: 32, height: 20, channels: 4, background: '#2288cc80' } }).png().toBuffer();

async function fixture(t, source) {
  const root = await mkdtemp(resolve(tmpdir(), 'localize-cards-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, 'cards.yaml'), source);
  return root;
}

async function imageServer(t) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/card.jpg?size=large' }).end();
    } else if (request.url === '/card.jpg?size=large') {
      // 扩展名和 Content-Type 均不能决定落盘格式。
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(png);
    } else if (request.url === '/html') {
      response.writeHead(200).end('<html>不是图片</html>');
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const close = () => new Promise((done, reject) => {
    server.close(error => error ? reject(error) : done());
    server.closeAllConnections();
  });
  t.after(() => server.listening && close());
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close };
}

test('识别 HTTP(S)、省略协议的网址，同时保留相对路径和普通文件名', () => {
  for (const [source, expected] of [
    ['https://images.example.com/a.png?size=2#front', 'https://images.example.com/a.png?size=2'],
    ['HTTP://images.example.com/a.png', 'http://images.example.com/a.png'],
    ['//images.example.com/a.png', 'https://images.example.com/a.png'],
    ['images.example.com/a.png', 'https://images.example.com/a.png'],
    ['images.example.com:8443/a.png', 'https://images.example.com:8443/a.png'],
    ['127.0.0.1/card.png', 'https://127.0.0.1/card.png'],
    ['./assets/cards/a.png', null], ['assets/cards/a.png', null],
    ['../cards/a.png', null], ['card.jpg', null], ['./images.example.com/a.png', null]
  ]) assert.equal(remoteImageUrl(source), expected, source);
  assert.throws(() => remoteImageUrl('file:///etc/passwd'), /http/);
  assert.throws(() => remoteImageUrl('ftp://images.example.com/a.png'), /http/);
});

test('省略协议的地址实际按 HTTPS 下载，本地路径不请求网络', async () => {
  const requested = [];
  const result = await localizeCardImages({
    source: stringify([
      card('domain', 'images.example.com/a.png'),
      card('protocol-relative', '//images.example.com/b.png'),
      card('local', './assets/cards/already.png')
    ]),
    fetchImage: async url => { requested.push(url); return new Response(png); }
  });
  assert.deepEqual(requested, ['https://images.example.com/a.png', 'https://images.example.com/b.png']);
  assert.equal(result.changedCards, 2);
  assert.equal(parseCards(result.source)[2].image, './assets/cards/already.png');
});

test('跟随重定向、按实际格式保存原图、复用相同网址并保留注释及卡片资料', async t => {
  const { url, requests } = await imageServer(t);
  const source = `# 收藏说明\n${stringify([
    { ...card('first', `${url}/redirect`), bin: 621700 }, card('second', `${url}/redirect`), card('local', './assets/cards/old.webp')
  ])}`.replace(`图片: ${url}/redirect`, `图片: '${url}/redirect' # 保留来源说明`);
  const result = await localizeCardImages({ source });
  assert.equal(result.changedCards, 2);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].path, 'assets/cards/first.png');
  assert.deepEqual(result.images[0].content, png);
  assert.deepEqual(requests, ['/redirect', '/card.jpg?size=large']);
  assert.match(result.source, /# 收藏说明/);
  assert.match(result.source, /# 保留来源说明/);
  assert.match(result.source, /bin: 621700/);
  assert.equal(parseCards(result.source)[0].bin, '621700');
  assert.deepEqual(parseCards(result.source), parseCards(source).map((item, index) => ({
    ...item, image: index < 2 ? './assets/cards/first.png' : item.image
  })));
});

test('文件名冲突不会覆盖已有卡面，卡片编号不能写到目标目录之外', async () => {
  const result = await localizeCardImages({
    source: stringify([card('same', 'https://example.com/a'), card('../../outside', 'https://example.com/b')]),
    existingPaths: ['assets/cards/same.png', 'assets/cards/same-2.png'],
    fetchImage: async () => new Response(png)
  });
  assert.equal(result.images[0].path, 'assets/cards/same-3.png');
  assert.equal(result.images[1].path, 'assets/cards/-outside.png');
  assert.equal(parseCards(result.source)[1].id, '../../outside');
});

test('新增 BIN 和嵌套资料字段不阻止本地化，字段值与注释均保留', async () => {
  const entry = {
    ...card('with-metadata', 'https://example.com/card.png'), bin: '012345',
    收藏资料: { 备注: '主题待确认', 标签: ['纪念卡', '校园版'] }
  };
  const source = `# 来源与核实记录\n${stringify([entry])}`.replace('bin: "012345"', 'bin: "012345" # 保留前导零');
  assert.throws(() => parseCards(source), /未知字段/);
  const result = await localizeCardImages({
    source, existingPaths: ['assets/cards/old.png'], fetchImage: async () => new Response(png)
  });
  assert.equal(result.changedCards, 1);
  assert.deepEqual(parse(result.source), [{ ...entry, 图片: './assets/cards/with-metadata.png' }]);
  assert.match(result.source, /# 来源与核实记录/);
  assert.match(result.source, /# 保留前导零/);
  assert.deepEqual(result.deletedImages, ['assets/cards/old.png']);
});

test('bot 只要求图片和可选编号，展示资料由应用校验器检查', async () => {
  const source = stringify([{ 图片: 'https://example.com/card.png', bin: 621700 }]);
  const result = await localizeCardImages({ source, fetchImage: async () => new Response(png) });
  assert.equal(result.images[0].path, 'assets/cards/card-1.png');
  assert.deepEqual(parse(result.source), [{ 图片: './assets/cards/card-1.png', bin: 621700 }]);
  assert.throws(() => parseCards(result.source));
});

test('YAML、图片和编号错误在任何下载之前报错', async () => {
  const valid = card('first', 'https://example.com/card.png');
  const cases = [
    ['- 图片: [未结束\n', /格式错误/],
    ['- 图片: one.png\n  图片: two.png\n', /格式错误/],
    ['图片: local.png\n', /必须是卡片列表/],
    [stringify([valid, null]), /第 2 张卡片/],
    [stringify([valid, { 图片: '' }]), /第 2 张卡片.*图片/],
    [stringify([valid, { 图片: 123 }]), /第 2 张卡片.*图片/],
    [stringify([valid, { 图片: 'local.png', 编号: 123 }]), /第 2 张卡片.*编号/],
    [stringify([valid, { 图片: 'local.png', 编号: 'first' }]), /第 2 张卡片.*重复/]
  ];
  for (const [source, message] of cases) {
    await assert.rejects(localizeCardImages({ source, fetchImage() { assert.fail('资料无效时不应下载'); } }), message);
  }
});

test('全部是本地路径或空列表时不下载、不重新格式化 YAML', async () => {
  for (const source of ['# 空收藏\n', stringify([{ ...card('local', './assets/cards/local.png'), bin: 621700, 收藏备注: '已核实' }])]) {
    const result = await localizeCardImages({ source, fetchImage() { assert.fail('本地卡面不应下载'); } });
    assert.equal(result.source, source);
    assert.deepEqual(result.images, []);
    assert.equal(result.changedCards, 0);
    assert.deepEqual(result.deletedImages, []);
  }
});

test('清理按规范化的相对路径判断引用，保留共享卡面和非卡面资源', async () => {
  const source = stringify([
    card('shared-one', './assets/cards/shared.png'),
    card('shared-two', 'assets/cards/shared.png'),
    card('normalized', './assets/cards/nested/../keep.webp'),
    card('nested', 'assets/cards/nested/keep.JPG')
  ]);
  const result = await localizeCardImages({
    source,
    existingPaths: [
      'assets/cards/shared.png', 'assets/cards/keep.webp', 'assets/cards/nested/keep.JPG',
      'assets/cards/unused.png', 'assets/cards/nested/unused.JPG', 'assets/cards/README.md',
      'assets/cards/.gitkeep', 'assets/logos/banks/test.svg', 'assets/collection.webp'
    ],
    fetchImage() { assert.fail('本地卡面不应下载'); }
  });
  assert.deepEqual(result.deletedImages, ['assets/cards/unused.png', 'assets/cards/nested/unused.JPG']);
  assert.equal(result.changedCards, 0);
  assert.equal(result.source, source);
});

test('替换远程卡面后删除旧文件，保留新下载的图片', async () => {
  const result = await localizeCardImages({
    source: stringify([card('replace', 'https://example.com/new.png')]),
    existingPaths: ['assets/cards/replace.png'],
    fetchImage: async () => new Response(png)
  });
  assert.deepEqual(result.deletedImages, ['assets/cards/replace.png']);
  assert.equal(result.images[0].path, 'assets/cards/replace-2.png');
  assert.equal(parseCards(result.source)[0].image, './assets/cards/replace-2.png');
});

test('空卡片列表清理子目录图片，保留文档、目录和符号链接，重复运行无变化', async t => {
  const source = '# 暂时没有卡片\n';
  const root = await fixture(t, source);
  await mkdir(resolve(root, 'assets/cards/nested'), { recursive: true });
  await mkdir(resolve(root, 'assets/cards/directory.png'));
  await writeFile(resolve(root, 'assets/cards/old.png'), png);
  await writeFile(resolve(root, 'assets/cards/nested/old.JPG'), png);
  await writeFile(resolve(root, 'assets/cards/README.md'), '说明');
  await writeFile(resolve(root, 'assets/collection.webp'), png);
  await symlink('../collection.webp', resolve(root, 'assets/cards/link.webp'));

  const result = await localizeCardsFile({ root, log() {} });
  assert.deepEqual(result.deletedImages.sort(), ['assets/cards/nested/old.JPG', 'assets/cards/old.png']);
  assert.equal(await readFile(resolve(root, 'cards.yaml'), 'utf8'), source);
  assert.equal(await readFile(resolve(root, 'assets/cards/README.md'), 'utf8'), '说明');
  assert.deepEqual(await readFile(resolve(root, 'assets/collection.webp')), png);
  assert.ok((await lstat(resolve(root, 'assets/cards/directory.png'))).isDirectory());
  assert.ok((await lstat(resolve(root, 'assets/cards/link.webp'))).isSymbolicLink());
  assert.deepEqual(await readdir(resolve(root, 'assets/cards/nested')), []);
  assert.deepEqual((await localizeCardsFile({ root, log() {} })).deletedImages, []);
});

test('下载或校验失败时不改写 YAML、不写入新图，也不清理旧图', async t => {
  const { url } = await imageServer(t);
  for (const path of ['/missing', '/html']) {
    const source = stringify([card('ok', `${url}/redirect`), card('broken', `${url}${path}`)]);
    const root = await fixture(t, source);
    await mkdir(resolve(root, 'assets/cards'), { recursive: true });
    await writeFile(resolve(root, 'assets/cards/old.png'), png);
    await assert.rejects(localizeCardsFile({ root, log() {} }), /卡片「broken」本地化失败/);
    assert.equal(await readFile(resolve(root, 'cards.yaml'), 'utf8'), source);
    assert.deepEqual(await readdir(resolve(root, 'assets/cards')), ['old.png']);
    assert.deepEqual(await readFile(resolve(root, 'assets/cards/old.png')), png);
  }
});

test('资料校验失败时不清理已有图片', async t => {
  const source = '- 名称: 缺少银行和图片\n';
  const root = await fixture(t, source);
  await mkdir(resolve(root, 'assets/cards'), { recursive: true });
  await writeFile(resolve(root, 'assets/cards/old.png'), png);
  await assert.rejects(localizeCardsFile({ root, log() {} }), /第 1 张卡片/);
  assert.equal(await readFile(resolve(root, 'cards.yaml'), 'utf8'), source);
  assert.deepEqual(await readFile(resolve(root, 'assets/cards/old.png')), png);
});

test('本地化后可在图片源离线时构建，重复运行不会增加文件或改写资料', async t => {
  const { url, close } = await imageServer(t);
  const root = await fixture(t, stringify([card('offline', `${url}/redirect`)]));
  for (const file of ['index.html', 'app.js', 'styles.css', '.nojekyll', 'assets/card-mark.svg', 'assets/logos']) {
    await mkdir(dirname(resolve(root, file)), { recursive: true });
    await cp(resolve(projectRoot, file), resolve(root, file), { recursive: true });
  }
  await localizeCardsFile({ root, log() {} });
  await close();
  const saved = await readFile(resolve(root, 'cards.yaml'), 'utf8');
  const second = await localizeCardsFile({ root, log() {} });
  assert.equal(second.changedCards, 0);
  assert.deepEqual(second.deletedImages, []);
  assert.equal(await readFile(resolve(root, 'cards.yaml'), 'utf8'), saved);
  assert.deepEqual(await readdir(resolve(root, 'assets/cards')), ['offline.png']);
  assert.deepEqual(await readFile(resolve(root, 'assets/cards/offline.png')), png);
  await buildSite({ root, log() {} });
  assert.equal((await sharp(resolve(root, 'public/cards/1.webp')).metadata()).format, 'webp');
});
