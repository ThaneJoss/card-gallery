// Run pnpm test:browser (Chromium must be installed).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const output = resolve(root, 'output/card-viewer');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(publicRoot + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
const external = new Set();
let browser;
let page;
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const canvas = page => page.locator('#detail-viewer canvas.card-viewer-canvas');
async function snapshot(page, name) {
  await frames(page);
  // Compare scenes with the same focus state; restore focus for keyboard tests.
  const focused = await page.evaluateHandle(() => document.activeElement);
  await focused.evaluate(element => element.blur());
  try {
    return await canvas(page).screenshot({ path: resolve(output, `${name}.png`) });
  } finally {
    await focused.evaluate(element => element.focus({ preventScroll: true }));
    await focused.dispose();
  }
}
async function difference(a, b) {
  const first = await sharp(a).removeAlpha().raw().toBuffer();
  const second = await sharp(b).removeAlpha().raw().toBuffer();
  assert.equal(first.length, second.length, '比较画面的尺寸必须一致');
  return first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0) / first.length;
}
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.add(request.url()); });
}
async function openCard(page, id) {
  await page.locator(`button[data-card="${id}"]`).click();
  await page.waitForFunction(() => document.querySelector('#detail-viewer')?.getAttribute('aria-busy') === 'false' && document.querySelector('#detail-viewer canvas'));
  await canvas(page).waitFor({ state: 'visible' });
  assert.equal(await canvas(page).count(), 1, '详情只能存在一个渲染画布');
  assert.equal(await page.locator('#detail-art').isVisible(), false, '3D就绪后原图应隐藏');
}
async function closeCard(page, id, escape = true) {
  if (escape) await page.keyboard.press('Escape');
  else await page.locator('#close-dialog').click();
  await page.locator('#card-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(id => document.activeElement?.dataset.card === id, id);
}
async function finishes(page, side) {
  await page.locator('[data-finish="matte"]').click();
  const matte = await snapshot(page, `${side}-matte`);
  for (const finish of ['gloss', 'iridescent']) {
    await page.locator(`[data-finish="${finish}"]`).click();
    assert.equal(await page.locator(`[data-finish="${finish}"]`).getAttribute('aria-pressed'), 'true');
    assert.ok(await difference(matte, await snapshot(page, `${side}-${finish}`)) > 0, `${side}的${finish}必须改变实际渲染`);
  }
  await page.locator('[data-finish="matte"]').click();
  assert.equal(await difference(matte, await snapshot(page, `${side}-matte-return`)), 0, `${side}切回哑光必须恢复画面`);
  return matte;
}
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  observe(page);
  await page.goto(origin);
  const cards = await page.evaluate(async () => Promise.all(window.CARD_GALLERY_DATA.map(async card => {
    const image = new Image(); image.src = card.image; await image.decode();
    return { ...card, width: image.naturalWidth, height: image.naturalHeight };
  })));
  const horizontal = cards.find(card => card.width > card.height);
  const vertical = cards.find(card => card.id === 'citic-visa-platinum-debit');
  const otherHorizontal = cards.find(card => card.width > card.height && card.id !== horizontal?.id);
  assert.ok(vertical?.height > vertical?.width && otherHorizontal, '回归数据须包含真正的竖版卡及第二张横版卡');
  assert.ok(horizontal && vertical, '回归数据须包含横卡和竖卡');
  await openCard(page, horizontal.id);
  await page.evaluate(() => {
    const canvas = document.querySelector('#detail-viewer canvas');
    const context = canvas.getContext('webgl2');
    window.__viewerRegression = { canvas, context, geometryUploads: 0 };
    const bufferData = context.bufferData;
    context.bufferData = function(target, ...args) {
      if (target === context.ARRAY_BUFFER) window.__viewerRegression.geometryUploads += 1;
      return bufferData.call(this, target, ...args);
    };
  });
  const assertSharedRenderer = async () => {
    assert.ok(await page.evaluate(() => {
      const canvas = document.querySelector('#detail-viewer canvas');
      return canvas === window.__viewerRegression.canvas && canvas.getContext('webgl2') === window.__viewerRegression.context;
    }), '换卡和重新打开必须复用同一个canvas及WebGL context');
    assert.equal(await page.evaluate(() => window.__viewerRegression.geometryUploads), 0, '换卡只能更新纹理或姿态，不得重新上传模型顶点缓冲');
  };
  const front = await finishes(page, 'front');
  await page.locator('#viewer-flip').click();
  const back = await finishes(page, 'back');
  assert.ok(await difference(front, back) > 0, '翻面按钮应显示不同的背面');
  await page.locator('#viewer-reset').click();
  assert.equal(await difference(front, await snapshot(page, 'reset')), 0, '复位应恢复正面相机');
  await canvas(page).focus();
  await page.keyboard.press('ArrowUp');
  assert.ok(await difference(front, await snapshot(page, 'tilted-up')) > 0, '方向键应改变相机俯仰');
  for (let step = 1; step < 24; step += 1) await page.keyboard.press('ArrowUp');
  assert.equal(await difference(front, await snapshot(page, 'full-pitch')), 0, '上下旋转整圈应回到初始画面而非卡在极点');
  await page.keyboard.press('ArrowRight');
  assert.ok(await difference(front, await snapshot(page, 'yaw-right')) > 0, '左右方向键应旋转相机');
  await page.keyboard.press('Home');
  assert.equal(await difference(front, await snapshot(page, 'home')), 0, 'Home应复位');
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * .7, { steps: 12 });
  await page.mouse.up();
  assert.ok(await difference(front, await snapshot(page, 'drag-up-down')) > 0, '上下拖动应改变实际画面');
  await page.locator('#viewer-reset').click();
  const distance = Math.min(box.width, box.height) / 2;
  for (let stroke = 0; stroke < 4; stroke += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - distance / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + distance / 2, { steps: 12 });
    await page.mouse.up();
  }
  assert.equal(await difference(front, await snapshot(page, 'drag-full-pitch')), 0, '上下拖动整圈应回到初始视角');
  await closeCard(page, horizontal.id);
  await openCard(page, vertical.id);
  await assertSharedRenderer();
  const portrait = await snapshot(page, 'portrait');
  await snapshot(page, 'citic-visa-platinum-debit');
  assert.ok(await difference(front, portrait) > 0, '换卡后应显示新卡面');
  await closeCard(page, vertical.id, false);
  await openCard(page, otherHorizontal.id);
  await assertSharedRenderer();
  await page.locator('[data-finish="matte"]').click();
  await page.locator('#viewer-reset').click();
  await page.locator('#viewer-flip').click();
  assert.equal(await difference(back, await snapshot(page, 'other-horizontal-back')), 0, '不同横版素材应共用固定模型几何和取景，纯色背面应完全一致');
  await closeCard(page, otherHorizontal.id, false);
  await openCard(page, 'cmb-koi-debit');
  await assertSharedRenderer();
  await snapshot(page, 'photo-texture');
  await closeCard(page, 'cmb-koi-debit');
  await openCard(page, horizontal.id);
  await assertSharedRenderer();
  assert.equal(await difference(front, await snapshot(page, 'reopened')), 0, '重新打开应恢复对应卡片默认画面');
  await closeCard(page, horizontal.id);

  // Hold the old card's image response while a newer selection becomes ready.
  let releaseImage;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  const oldImageURL = new URL(horizontal.image, origin + '/').href;
  const pendingImage = page.waitForRequest(oldImageURL);
  await page.route(oldImageURL, async route => {
    await imageGate;
    await route.continue();
  });
  await page.locator(`button[data-card="${horizontal.id}"]`).click();
  await pendingImage;
  assert.equal(await page.locator('#detail-viewer').getAttribute('aria-busy'), 'true', '旧卡应仍在加载');
  await closeCard(page, horizontal.id);
  await openCard(page, vertical.id);
  await assertSharedRenderer();
  const latestCard = await snapshot(page, 'race-latest-card');
  const oldResponse = page.waitForResponse(oldImageURL);
  releaseImage();
  await (await oldResponse).finished();
  await frames(page);
  await assertSharedRenderer();
  assert.equal(await difference(latestCard, await snapshot(page, 'race-after-old-image')), 0, '旧纹理迟到后不得覆盖当前卡面');
  assert.ok((await canvas(page).getAttribute('aria-label')).includes(vertical.name), '旧加载不得覆盖当前卡片名称');
  assert.equal(await canvas(page).count(), 1, '加载竞争后只能存在一个canvas');
  await closeCard(page, vertical.id);
  await page.unroute(oldImageURL);

  await page.close();
  page = await browser.newPage({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  observe(page);
  await page.goto(origin);
  await openCard(page, vertical.id);
  for (const finish of ['matte', 'gloss', 'iridescent']) {
    const button = page.locator(`[data-finish="${finish}"]`);
    await button.tap();
    assert.equal(await button.getAttribute('aria-pressed'), 'true', '触摸应切换材质');
    const bounds = await button.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, '320px下材质按钮不能溢出');
  }
  await page.locator('#detail-title').evaluate(element => { element.textContent = '超长中文卡片名称（全角括号）银行卡收藏三维展示测试'.repeat(3); });
  assert.ok(await page.locator('#card-dialog').evaluate(element => element.scrollWidth <= element.clientWidth), '长中文名称不能造成横向溢出');
  await page.screenshot({ path: resolve(output, 'mobile-portrait.png'), fullPage: true });
  await closeCard(page, vertical.id, false);
  assert.deepEqual([...external], [], '网站不能依赖外部CDN');
  assert.deepEqual(errors, [], '浏览器不得产生脚本或控制台错误');
  console.log(`3D浏览器回归通过，截图：${output}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
