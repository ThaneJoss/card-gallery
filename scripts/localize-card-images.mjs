import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseDocument } from 'yaml';
import { parseCards } from './card-data.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function remoteImageUrl(value) {
  let source = value.trim();
  if (source.startsWith('//')) source = `https:${source}`;
  // 无协议的域名需带路径或查询，避免把 card.jpg 这样的本地文件名当成域名。
  if (/^(?:(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?[/?#]/u.test(source)) {
    source = `https://${source}`;
  }
  if (!/^[a-z][a-z\d+.-]*:/i.test(source)) return null;
  if (!/^https?:\/\//i.test(source)) throw new Error('图片网址须使用 http:// 或 https://。');
  const url = new URL(source);
  url.hash = '';
  return url.href;
}

export async function localizeCardImages({ source, existingPaths = [], fetchImage = fetch }) {
  const cards = parseCards(source);
  const document = parseDocument(source);
  const paths = new Set(existingPaths);
  const downloads = new Map();
  const images = [];
  let changedCards = 0;

  for (const [index, card] of cards.entries()) {
    try {
      const url = remoteImageUrl(card.image);
      if (!url) continue;
      let path = downloads.get(url);
      if (!path) {
        const response = await fetchImage(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
        const content = Buffer.from(await response.arrayBuffer());
        const { format, compression } = await sharp(content).metadata();
        const extension = format === 'jpeg' ? 'jpg' : format === 'heif' ? (compression === 'av1' ? 'avif' : 'heic') : format;
        const name = card.id.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || `card-${index + 1}`;
        path = `assets/cards/${name}.${extension}`;
        let suffix = 2;
        while (paths.has(path)) path = `assets/cards/${name}-${suffix++}.${extension}`;
        paths.add(path);
        downloads.set(url, path);
        images.push({ path, content });
      }
      document.setIn([index, '图片'], `./${path}`);
      changedCards++;
    } catch (error) {
      throw new Error(`卡片「${card.id}」本地化失败：${error.message}`, { cause: error });
    }
  }

  return { source: changedCards ? document.toString({ lineWidth: 0 }) : source, images, changedCards };
}

export async function localizeCardsFile({ root = projectRoot, log = console.log } = {}) {
  const sourcePath = resolve(root, 'cards.yaml');
  const entries = await readdir(resolve(root, 'assets/cards'), { recursive: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const result = await localizeCardImages({
    source: await readFile(sourcePath, 'utf8'),
    existingPaths: entries.map(path => `assets/cards/${path}`)
  });
  // 所有下载和图片校验完成后才写入，失败时保留原来的 YAML。
  for (const { path, content } of result.images) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content, { flag: 'wx' });
  }
  if (result.changedCards) await writeFile(sourcePath, result.source);
  log(`卡面本地化完成：更新 ${result.changedCards} 张卡片，新增 ${result.images.length} 个图片文件。`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  localizeCardsFile().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
