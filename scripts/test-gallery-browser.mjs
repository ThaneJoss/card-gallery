import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public'), output = resolve(root, 'output/gallery');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(publicRoot + sep)) return void response.writeHead(403).end();
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [], external = [];
let browser, page;

async function accessible(name) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await writeFile(resolve(output, `${name}-axe.json`), JSON.stringify(result, null, 2));
  assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), [], `${name} 无障碍检查`);
}

const visibleIds = () => page.locator('[data-card]').evaluateAll(cards => cards.map(card => card.dataset.card).sort());
const focused = selector => page.locator(selector).evaluate(element => element === document.activeElement);
const ready = () => page.waitForFunction(() => document.querySelector('#detail-viewer').getAttribute('aria-busy') === 'false' && document.querySelector('#detail-viewer canvas'));
async function closeCard(id) {
  await page.keyboard.press('Escape');
  await page.locator('#card-dialog').waitFor({ state: 'hidden' });
  // The dialog close event restores focus asynchronously.
  await page.waitForFunction(id => document.activeElement?.dataset.card === id, id);
}

try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  for (const width of [1440, 768, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width === 320, isMobile: width === 320 });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto(origin);
    const cards = await page.evaluate(() => window.CARD_GALLERY_DATA);
    assert.equal(await page.locator('[data-card]').count(), cards.length);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 首页不能横向溢出`);
    const columns = await page.locator('.bank-card-row').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width >= 1024 ? 4 : width >= 600 ? 2 : 1, '保持卡组织的响应式列布局');
    await page.keyboard.press('Tab');
    assert.ok(await focused('.skip-link'), '首个键盘入口为跳转链接');
    await page.keyboard.press('Enter');
    assert.ok(await focused('#gallery'), '跳转链接将焦点移入画廊');
    await page.keyboard.press('/');
    assert.ok(await focused('#search-input'), '/ 聚焦搜索');
    await page.locator('#search-input').blur();
    await page.screenshot({ path: resolve(output, `${width}-gallery.png`) });
    await accessible(`${width}-gallery`);

    await page.locator('#bank-trigger').focus();
    await page.keyboard.press('ArrowDown');
    assert.ok(await focused('#bank-options [data-value="all"]'));
    const bankScroll = page.locator('.picker-group-options').first();
    await bankScroll.focus();
    await page.keyboard.press('ArrowDown');
    assert.ok(await bankScroll.locator('[role="option"]').first().evaluate(element => element === document.activeElement), '滚动区域的向下键进入首家银行');
    await bankScroll.focus();
    await page.keyboard.press('ArrowUp');
    assert.ok(await bankScroll.locator('[role="option"]').last().evaluate(element => element === document.activeElement), '滚动区域的向上键进入末家银行');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.ok(await focused('[data-value="region:mainland"]'));
    await page.keyboard.press('ArrowRight');
    assert.ok(await focused('[data-value="region:hong-kong"]'), '左右键可在银行分栏间移动');
    await accessible(`${width}-bank-picker`);
    await page.keyboard.press('Enter');
    assert.ok(await focused('#bank-trigger'), '选择银行后焦点回到触发按钮');
    await page.locator('[data-type="debit"]').click();
    await page.locator('#network-trigger').click();
    await page.locator('#network-options [data-value="visa"]').click();
    await page.locator('#search-input').fill(' ＶＩＳＡ ');
    const expected = cards.filter(card => ['香港中银', '香港汇丰', '香港众安', '香港汇立', '香港大象'].includes(card.bank) && card.type === 'debit' && card.networks.includes('visa')).map(card => card.id).sort();
    assert.ok(expected.length > 0, '组合筛选须包含真实卡片');
    assert.deepEqual(await visibleIds(), expected, '地区、类型、卡组织与全角搜索可组合');
    const existingCard = await page.locator('[data-card]').first().elementHandle();
    await page.locator('#search-input').fill('visa');
    assert.ok(await existingCard.evaluate(element => element.isConnected), '等价搜索不重建卡片节点');
    await page.locator('#network-trigger').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');
    assert.ok(await focused('#network-options [data-value="all"]'));
    await page.keyboard.press('End');
    assert.ok(await focused('#network-options [data-value="discover"]'));
    await page.keyboard.press('Escape');
    assert.ok(await focused('#network-trigger'));
    assert.equal(await page.locator('#network-trigger').getAttribute('aria-expanded'), 'false');
    await page.locator('#search-input').fill('没有此卡片的搜索词');
    assert.ok(await page.locator('#empty-state').isVisible());
    assert.equal(await page.locator('#gallery').isVisible(), false);
    await page.locator('#empty-reset').click();
    assert.deepEqual(await visibleIds(), cards.map(card => card.id).sort());
    assert.ok(await focused('[data-type="all"]'), '重置后焦点回到筛选起点');

    if (width !== 768) {
      const card = cards.find(card => card.studio?.status === 'ready' && card.studio.elements.length > 0);
      assert.ok(card, '无障碍回归须覆盖真实分层卡面');
      await page.locator(`[data-card="${card.id}"]`).click();
      await ready();
      await page.locator('[data-card-view="layers"]').click();
      await ready();
      const targets = '.card-view-options button, .studio-downloads a, .detail-filebar a, .selected-layer > a, .studio-panel-heading button, #layer-spacing, .layer-visibility, .preview-background button';
      const tooSmall = await page.locator(targets).evaluateAll(elements => elements.filter(element => {
        const box = element.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      }).map(element => element.id || element.className || element.textContent));
      assert.deepEqual(tooSmall, [], '分层操作与下载入口至少提供 44 × 44 CSS 像素触控区域');
      await accessible(`${width}-layers`);
      assert.ok(await page.locator('#card-dialog').evaluate(element => element.scrollWidth <= element.clientWidth), '分层控件不能撑出弹窗');
      await page.locator('.dialog-content').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: resolve(output, `${width}-dialog.png`) });
      await page.locator('#studio-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${width}-layer-controls.png`) });
      await closeCard(card.id);

      const orderedIds = await page.locator('[data-card]').evaluateAll(elements => elements.map(element => element.dataset.card));
      for (const [index, direction, nextFocus] of [[1, 'previous', 'next'], [orderedIds.length - 2, 'next', 'previous']]) {
        await page.locator(`[data-card="${orderedIds[index]}"]`).click();
        await ready();
        await page.locator(`#${direction}-card`).focus();
        await page.keyboard.press('Enter');
        await ready();
        assert.ok(await page.locator(`#${direction}-card`).isDisabled());
        assert.ok(await focused(`#${nextFocus}-card`), '到达首尾时焦点留在可用导航按钮上');
        const boundary = direction === 'previous' ? orderedIds[0] : orderedIds.at(-1);
        await closeCard(boundary);
      }
    }
    await context.close();
  }
  assert.deepEqual(external, [], '浏览器回归仅使用本地资源');
  assert.deepEqual(errors, [], '页面不能产生脚本或控制台错误');
  console.log(`画廊、键盘、响应式与 axe 回归通过，证据：${output}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
