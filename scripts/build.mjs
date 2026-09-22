import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { build as bundle } from 'esbuild';
import { parseCards } from './card-data.mjs';

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
  const cards = parseCards(await readFile(resolve(root, 'cards.yaml'), 'utf8'));

  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'cards'), { recursive: true });
  try {
    for (const file of ['index.html', 'styles.css', '.nojekyll', 'assets/card-mark.svg', 'assets/logos']) {
      const destination = resolve(output, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(resolve(root, file), destination, { recursive: true });
    }

    await bundle({
      entryPoints: [resolve(root, 'app.js')],
      outfile: resolve(output, 'app.js'),
      bundle: true,
      minify: true,
      format: 'iife',
      target: ['es2022']
    });
    await bundle({
      entryPoints: [resolve(root, 'src/card-viewer.js')],
      outfile: resolve(output, 'card-viewer.js'),
      nodePaths: [resolve(projectRoot, 'node_modules')],
      bundle: true,
      minify: true,
      format: 'iife',
      globalName: 'CardGallery3D',
      target: ['es2022'],
      legalComments: 'inline',
      banner: { js: '/*! Three.js - MIT License; see card-viewer.LICENSE.txt */' }
    });
    await cp(resolve(projectRoot, 'node_modules/three/LICENSE'), resolve(output, 'card-viewer.LICENSE.txt'));

    const builtCards = new Array(cards.length);
    // 每批最多处理四张，避免卡片增多时同时下载全部原图。
    for (let offset = 0; offset < cards.length; offset += 4) {
      const batch = cards.slice(offset, offset + 4);
      const results = await Promise.allSettled(batch.map(async (card, index) => {
        const position = offset + index;
        const imagePath = `./cards/${position + 1}.webp`;
        try {
          const input = await readImage(card.image.trim(), root);
          const dimensions = await sharp(input)
            .rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(resolve(output, imagePath));
          builtCards[position] = { ...card, image: imagePath, imageWidth: dimensions.width, imageHeight: dimensions.height };
        } catch (error) {
          throw new Error(`卡片「${card.id}」处理失败：${error.message}`, { cause: error });
        }
        log(`已处理 ${card.id} → ${imagePath}`);
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }

    const { assets } = JSON.parse(await readFile(resolve(root, 'assets/logos/sources.json'), 'utf8'));
    const bankLogos = Object.fromEntries(assets
      .filter(asset => asset.file.startsWith('banks/'))
      .map(asset => [asset.name, `./assets/logos/${asset.file}`]));
    await writeFile(resolve(output, 'cards.js'), `// 自动生成；请编辑项目根目录的 cards.yaml。\nwindow.CARD_GALLERY_DATA = ${JSON.stringify(builtCards, null, 2)};\n\n// 银行图标根据 assets/logos/sources.json 自动匹配。\nwindow.CARD_GALLERY_BANK_LOGOS = ${JSON.stringify(bankLogos, null, 2)};\n`);
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
