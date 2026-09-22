import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { fitCardFace } from '../src/card-presentation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public'), output = resolve(root, 'output/card-studio');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(publicRoot, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(publicRoot + sep)) return void response.writeHead(403).end();
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
let browser;
const idle = page => page.waitForFunction(() => document.querySelector('#detail-viewer').getAttribute('aria-busy') === 'false');
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function screenshot(page, name) {
  // Layer controls can scroll the dialog. Capture from a stable CSS pixel origin
  // so fractional scroll positions do not add a row to comparison screenshots.
  await page.locator('.dialog-content').evaluate(element => { element.scrollTop = 0; });
  await frame(page);
  const box = await page.locator('#detail-visual').boundingBox();
  const viewport = await page.screenshot({ style: '#detail-viewer:focus-visible { outline: none !important; }' });
  const result = await sharp(viewport).extract({ left: Math.floor(box.x), top: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) }).png().toBuffer();
  await writeFile(resolve(output, `${name}.png`), result);
  return result;
}
async function difference(a, b) {
  const first = await sharp(a).removeAlpha().raw().toBuffer(), second = await sharp(b).removeAlpha().raw().toBuffer();
  assert.equal(first.length, second.length);
  return first.reduce((sum, value, i) => sum + Math.abs(value - second[i]), 0) / first.length;
}
async function assertLayerPositions(composite, clean, card) {
  const { data, info } = await sharp(composite).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = await sharp(clean).removeAlpha().raw().toBuffer();
  const face = fitCardFace(info.width, info.height, card.studio.height > card.studio.width);
  const regions = card.studio.elements.map(({ box: [x, y, w, h] }) => ({
    left: face.left + x * face.width - 3, top: face.top + y * face.height - 3,
    right: face.left + (x + w) * face.width + 3, bottom: face.top + (y + h) * face.height + 3,
  }));
  let changed = 0, outside = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * 3;
    if (Math.max(...[0, 1, 2].map(c => Math.abs(data[p + c] - background[p + c]))) < 24) continue;
    changed++;
    if (!regions.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) outside++;
  }
  assert.ok(changed > 30, '透明图层须产生可见元素');
  assert.ok(outside / changed < .01, `${card.id} 的图层须落在记录坐标内，区域外比例 ${outside / changed}`);
}
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  for (const width of [1440, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width === 320, hasTouch: width === 320, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(origin);
    const card = await page.evaluate(() => window.CARD_GALLERY_DATA.find(item => item.id === 'ccb-bilibili-landscape-student'));
    assert.equal(card.studio?.status, 'ready', '图层验收须有已完成的锦绣山河素材');
    await page.locator(`[data-card="${card.id}"]`).click();
    await idle(page);
    assert.equal(await page.locator('[data-card-view="hd"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#detail-art').count(), 0);
    const canvas = await page.locator('#detail-viewer canvas').evaluateHandle(element => element);
    const hd = await screenshot(page, `${width}-hd`);
    await page.locator('[data-card-view="clean"]').click();
    await idle(page);
    const clean = await screenshot(page, `${width}-clean`);
    assert.ok(await difference(hd, clean) > 1, '纯底图须显示实际去文字结果');
    await page.locator('[data-card-view="layers"]').click();
    await idle(page);
    assert.equal(await page.locator('[data-layer-row]').count(), card.studio.elements.length);
    assert.ok(await page.locator('#detail-viewer canvas').evaluate((element, previous) => element === previous, canvas), '切换版本必须复用画布');
    await page.locator('#layer-spacing').fill('0');
    await page.locator('#detail-viewer').focus();
    await page.keyboard.press('Home');
    const composite = await screenshot(page, `${width}-composite`);
    await page.locator('[data-layers-visible="false"]').click();
    const allHidden = await screenshot(page, `${width}-layers-hidden`);
    assert.ok(await difference(composite, allHidden) > .1, '图层开关须改变三维渲染');
    await assertLayerPositions(composite, allHidden, card);
    await page.locator('[data-layers-visible="true"]').click();
    assert.equal(await difference(composite, await screenshot(page, `${width}-layers-restored`)), 0);
    const layer = card.studio.elements[0];
    await page.locator(`[data-layer-select="${layer.id}"]`).last().click();
    assert.ok((await page.locator('#selected-layer-position').textContent()).includes(`X ${layer.pixels[0]}`));
    const response = await page.request.get(new URL(layer.image, origin).href);
    assert.equal(response.status(), 200);
    const image = await sharp(await response.body()).metadata();
    assert.equal(image.hasAlpha, true);
    const download = page.waitForEvent('download');
    await page.locator('#selected-layer-download').click();
    assert.equal((await download).suggestedFilename(), `${card.id}-${layer.id}.png`);
    const manifest = await page.request.get(new URL(card.studio.manifest, origin).href);
    assert.equal((await manifest.json()).elements.length, card.studio.elements.length);
    await page.locator('#layer-spacing').fill('85');
    await page.locator('#detail-viewer').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await screenshot(page, `${width}-separated`);
    await page.locator('.dialog-content').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: resolve(output, `${width}-studio.png`) });
    assert.ok(await page.locator('#card-dialog').evaluate(element => element.scrollWidth <= element.clientWidth), `${width}px 弹窗不能横向溢出`);
    await page.locator('#next-card').click();
    await idle(page);
    assert.notEqual(await page.locator('#detail-title').textContent(), card.name);
    await page.locator('#previous-card').click();
    await idle(page);
    assert.equal(await page.locator('#detail-title').textContent(), card.name);
    assert.equal(await page.locator('[data-card-view="hd"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-card-view="original"]').click();
    await idle(page);
    await screenshot(page, `${width}-original`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(id => document.activeElement?.dataset.card === id, card.id);
    const portrait = await page.evaluate(() => window.CARD_GALLERY_DATA.find(item => item.id === 'cmb-koi-debit'));
    assert.equal(portrait.studio?.status, 'ready', '竖卡验收须有已完成的招行锦鲤素材');
    await page.locator(`[data-card="${portrait.id}"]`).click();
    await idle(page);
    assert.ok(await page.locator('#detail-viewer').evaluate(element => element.classList.contains('is-portrait')));
    await page.locator('[data-card-view="layers"]').click();
    await idle(page);
    await page.locator('#layer-spacing').fill('0');
    const portraitComposite = await screenshot(page, `${width}-portrait-composite`);
    await page.locator('[data-layers-visible="false"]').click();
    const portraitClean = await screenshot(page, `${width}-portrait-clean`);
    await assertLayerPositions(portraitComposite, portraitClean, portrait);
    await page.locator('[data-layers-visible="true"]').click();
    await page.locator('#layer-spacing').fill('100');
    await page.locator('#detail-viewer').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    const separated = await screenshot(page, `${width}-portrait-separated`);
    for (const element of portrait.studio.elements) {
      const toggle = page.locator(`[data-layer-visible="${element.id}"]`);
      await toggle.uncheck();
      assert.ok(await difference(separated, await screenshot(page, `${width}-portrait-without-${element.id}`)) > 0,
        `斜视时 ${element.label} 仍须显示，不能被底图覆盖`);
      await toggle.check();
    }
    await page.close();
  }
  // Switch away while one transparent image is still loading. The finished base must
  // remain reusable, and a late layer response must not overwrite the selected view.
  const race = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  race.on('pageerror', error => errors.push(error.message));
  await race.goto(origin);
  const raceCard = await race.evaluate(() => window.CARD_GALLERY_DATA.find(item => item.id === 'ccb-bilibili-landscape-student'));
  let cleanRequests = 0, releaseLayer, layerStarted;
  const delayed = new Promise(resolve => { releaseLayer = resolve; });
  const started = new Promise(resolve => { layerStarted = resolve; });
  await race.route(`**/${raceCard.studio.clean.slice(2)}`, async route => {
    cleanRequests++;
    await route.continue();
  });
  await race.route(`**/${raceCard.studio.elements.at(-1).image.slice(2)}`, async route => {
    layerStarted();
    await delayed;
    await route.continue();
  });
  try {
    await race.locator(`[data-card="${raceCard.id}"]`).click();
    await idle(race);
    const cleanResponse = race.waitForResponse(response => response.url().endsWith(raceCard.studio.clean.slice(1)));
    await race.locator('[data-card-view="layers"]').click();
    await Promise.all([started, cleanResponse]);
    await frame(race);
    await race.locator('[data-card-view="clean"]').click();
    await idle(race);
    assert.equal(cleanRequests, 1, '分层加载中的已完成底图须被新视图复用');
    const latest = await screenshot(race, 'race-clean');
    releaseLayer();
    await race.waitForLoadState('networkidle');
    assert.equal(await difference(latest, await screenshot(race, 'race-after-layers')), 0, '迟到图层不得覆盖纯底图视图');
  } finally {
    releaseLayer();
    await race.close();
  }
  assert.deepEqual(errors, []);
  console.log(`高清与图层浏览器回归通过，截图：${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
