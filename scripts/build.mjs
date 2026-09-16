import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readImage(source, root) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(resolve(root, source));
}

export async function buildSite({ root = projectRoot, log = console.log } = {}) {
  const output = resolve(root, 'public');
  const context = { window: {} };
  runInNewContext(await readFile(resolve(root, 'cards.js'), 'utf8'), context, { filename: 'cards.js' });
  const cards = context.window.CARD_GALLERY_DATA;
  if (!Array.isArray(cards)) throw new Error('cards.js 中的 CARD_GALLERY_DATA 必须是数组。');
  const ids = new Set();
  for (const [index, card] of cards.entries()) {
    if (!card || typeof card.id !== 'string' || !card.id.trim()) {
      throw new Error(`第 ${index + 1} 张卡片缺少 id。`);
    }
    const id = card.id.trim();
    if (ids.has(id)) throw new Error(`卡片 id「${id}」重复。`);
    ids.add(id);
    if (typeof card.image !== 'string' || !card.image.trim()) {
      throw new Error(`卡片「${id}」缺少 image。`);
    }
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'cards'), { recursive: true });
  try {
    for (const file of ['index.html', 'app.js', 'styles.css', '.nojekyll', 'assets/card-mark.svg', 'assets/logos']) {
      const destination = resolve(output, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(resolve(root, file), destination, { recursive: true });
    }

    const builtCards = new Array(cards.length);
    // 每批最多处理四张，避免卡片增多时同时下载全部原图。
    for (let offset = 0; offset < cards.length; offset += 4) {
      const batch = cards.slice(offset, offset + 4);
      const results = await Promise.allSettled(batch.map(async (card, index) => {
        const position = offset + index;
        const imagePath = `./cards/${position + 1}.webp`;
        try {
          const input = await readImage(card.image.trim(), root);
          await sharp(input)
            .rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(resolve(output, imagePath));
        } catch (error) {
          throw new Error(`卡片「${card.id}」处理失败：${error.message}`, { cause: error });
        }
        builtCards[position] = { ...card, image: imagePath };
        log(`已处理 ${card.id} → ${imagePath}`);
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }

    await writeFile(resolve(output, 'cards.js'), `// 自动生成；请编辑项目根目录的 cards.js。\nwindow.CARD_GALLERY_DATA = ${JSON.stringify(builtCards, null, 2)};\n`);
    log(`构建完成：${cards.length} 张卡片，发布目录 public/。`);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
