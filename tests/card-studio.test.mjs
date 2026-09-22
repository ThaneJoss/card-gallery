import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { publishCardStudio } from '../scripts/card-studio.mjs';
import { cardView, layerPlacement } from '../src/card-studio.mjs';
import { CARD_SHAPE } from '../src/card-presentation.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'card-studio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = resolve(root, 'assets/card-studio/example');
  await mkdir(resolve(directory, 'layers'), { recursive: true });
  for (const name of ['hd', 'clean']) await sharp({ create: { width: 400, height: 250, channels: 3, background: '#97bad2' } }).webp().toFile(resolve(directory, `${name}.webp`));
  const ink = await sharp({ create: { width: 80, height: 30, channels: 4, background: '#1765cd' } }).png().toBuffer();
  await sharp({ create: { width: 100, height: 50, channels: 4, background: '#00000000' } })
    .composite([{ input: ink, left: 10, top: 10 }]).png().toFile(resolve(directory, 'layers/logo.png'));
  const entry = { version: 1, cardId: 'example', status: 'ready', width: 400, height: 250,
    hd: 'hd.webp', clean: 'clean.webp', notes: ['生成式重建'],
    elements: [{ id: 'logo', label: '银行标志', kind: 'logo', image: 'layers/logo.png', box: [.1, .2, .25, .2] }] };
  const save = value => writeFile(resolve(directory, 'index.json'), JSON.stringify(value));
  await save(entry);
  return { root, directory, entry, save, output: resolve(root, 'public'), cardId: 'example' };
}

test('发布完整卡面、底图、透明PNG和可独立下载的像素坐标', async t => {
  const context = await fixture(t);
  const studio = await publishCardStudio(context);
  assert.equal(studio.hd, './studio/example/hd.webp');
  assert.deepEqual(studio.elements[0].pixels, [40, 50, 100, 50]);
  assert.equal((await sharp(resolve(context.output, studio.elements[0].image)).metadata()).hasAlpha, true);
  const exported = JSON.parse(await readFile(resolve(context.output, studio.manifest), 'utf8'));
  assert.equal(exported.coordinateOrigin, 'top-left');
  assert.equal(exported.elements[0].image, 'layers/logo.png');
  assert.deepEqual(exported.elements[0].pixels, [40, 50, 100, 50]);
  assert.equal((await sharp(resolve(context.output, studio.thumbnail)).metadata()).width, 400);
});

test('未处理卡片和明确占位图保留其真实状态', async t => {
  const context = await fixture(t);
  assert.equal(await publishCardStudio({ ...context, cardId: 'missing' }), undefined);
  await context.save({ version: 1, cardId: 'example', status: 'placeholder', notes: ['原素材是占位图'] });
  assert.deepEqual(await publishCardStudio(context), { status: 'placeholder', notes: ['原素材是占位图'] });
});

test('拦截越界坐标、不透明矩形及不一致的图层尺寸', async t => {
  const context = await fixture(t);
  context.entry.elements[0].box = [.9, .2, .25, .2];
  await context.save(context.entry);
  await assert.rejects(publishCardStudio(context), /归一化坐标/);
  context.entry.elements[0].box = [.1, .2, .2, .2];
  await context.save(context.entry);
  await assert.rejects(publishCardStudio(context), /尺寸与坐标不一致/);
  context.entry.elements[0].box = [.1, .2, .25, .2];
  await context.save(context.entry);
  await sharp({ create: { width: 100, height: 50, channels: 4, background: '#1765cd' } }).png().toFile(resolve(context.directory, 'layers/logo.png'));
  await assert.rejects(publishCardStudio(context), /透明区域/);
});

test('拒绝重复图层、跨目录素材及卡面与底图错位', async t => {
  const context = await fixture(t);
  context.entry.elements.push({ ...context.entry.elements[0] });
  await context.save(context.entry);
  await assert.rejects(publishCardStudio(context), /不重复/);
  context.entry.elements.pop();
  context.entry.hd = '../outside.webp';
  await context.save(context.entry);
  await assert.rejects(publishCardStudio(context), /超出本卡素材目录/);
  context.entry.hd = 'hd.webp';
  await context.save(context.entry);
  await sharp({ create: { width: 200, height: 250, channels: 3, background: '#1765cd' } }).webp().toFile(resolve(context.directory, 'clean.webp'));
  await assert.rejects(publishCardStudio(context), /相同的记录尺寸/);
});

test('切换高清与底图时不沿用原照片四角，分层只叠加独立元素', () => {
  const card = { image: 'photo.webp', textureCorners: [[.1, .1], [.9, .1], [.9, .9], [.1, .9]],
    studio: { status: 'ready', hd: 'hd.webp', clean: 'clean.webp', elements: [{ id: 'logo' }] } };
  assert.deepEqual(cardView(card, 'original').textureCorners, card.textureCorners);
  assert.deepEqual(cardView(card, 'hd'), { image: 'hd.webp', layers: [] });
  assert.deepEqual(cardView(card, 'clean'), { image: 'clean.webp', layers: [] });
  assert.deepEqual(cardView(card, 'layers'), { image: 'clean.webp', layers: [{ id: 'logo' }] });
  assert.equal(cardView({ image: 'source.webp' }, 'hd').image, 'source.webp');
});

test('归一化图层位置在横竖卡面中均以左上角为原点', () => {
  for (const portrait of [false, true]) {
    const width = portrait ? CARD_SHAPE.height : CARD_SHAPE.width;
    const height = portrait ? CARD_SHAPE.width : CARD_SHAPE.height;
    const topLeft = layerPlacement([0, 0, .2, .1], portrait);
    assert.ok(Math.abs(topLeft.x - topLeft.width / 2 + width / 2) < 1e-12);
    assert.ok(Math.abs(topLeft.y + topLeft.height / 2 - height / 2) < 1e-12);
    const centered = layerPlacement([.4, .45, .2, .1], portrait);
    assert.ok(Math.abs(centered.x) < 1e-12 && Math.abs(centered.y) < 1e-12);
  }
});
