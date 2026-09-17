import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseDocument } from 'yaml';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readImageCards(source) {
  let document;
  let entries;
  try {
    document = parseDocument(source);
    if (document.errors.length) throw document.errors[0];
    entries = document.toJS() ?? [];
  } catch (error) {
    throw new Error(`cards.yaml 格式错误，请检查提示位置的缩进和冒号：\n${error.message}`, { cause: error });
  }
  if (!Array.isArray(entries)) throw new Error('cards.yaml 必须是卡片列表，每张卡片以「- 名称:」开头。');
  const ids = new Set();
  // bot 只依赖图片和编号，应用新增的资料字段由原 YAML 文档保留。
  const cards = entries.map((entry, index) => {
    const label = `cards.yaml 第 ${index + 1} 张卡片`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label}须为包含「图片」的资料对象。`);
    if (typeof entry.图片 !== 'string' || !entry.图片.trim()) throw new Error(`${label}的「图片」须为非空文本。`);
    if (entry.编号 != null && typeof entry.编号 !== 'string') throw new Error(`${label}的「编号」须为文本。`);
    const id = entry.编号?.trim() || `card-${index + 1}`;
    if (ids.has(id)) throw new Error(`${label}的编号「${id}」重复，请修改或省略编号。`);
    ids.add(id);
    return { id, image: entry.图片.trim() };
  });
  return { document, cards };
}

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

export async function localizeCardImages({ source, existingPaths = [], existingFiles = existingPaths, fetchImage = fetch }) {
  const { cards, document } = readImageCards(source);
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
      card.image = `./${path}`;
      document.setIn([index, '图片'], card.image);
      changedCards++;
    } catch (error) {
      throw new Error(`卡片「${card.id}」本地化失败：${error.message}`, { cause: error });
    }
  }

  const updatedSource = changedCards ? document.toString({ lineWidth: 0 }) : source;
  const references = new Set(cards.map(card => posix.normalize(card.image)));
  // 按最终资料清理普通图片文件；目录和符号链接只参与文件名避让。
  const deletedImages = existingFiles.filter(path =>
    path.startsWith('assets/cards/') &&
    /\.(?:avif|bmp|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svg|tiff?|webp)$/i.test(path) &&
    !references.has(path)
  );
  return { source: updatedSource, images, changedCards, deletedImages };
}

export async function localizeCardsFile({ root = projectRoot, log = console.log } = {}) {
  const sourcePath = resolve(root, 'cards.yaml');
  const entries = await readdir(resolve(root, 'assets/cards'), { recursive: true, withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const repoPath = entry => relative(root, resolve(entry.parentPath, entry.name)).split(sep).join('/');
  const result = await localizeCardImages({
    source: await readFile(sourcePath, 'utf8'),
    existingPaths: entries.map(repoPath),
    existingFiles: entries.filter(entry => entry.isFile()).map(repoPath)
  });
  // 所有下载和图片校验完成后才写入，失败时保留原来的 YAML。
  for (const { path, content } of result.images) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content, { flag: 'wx' });
  }
  if (result.changedCards) await writeFile(sourcePath, result.source);
  for (const path of result.deletedImages) await rm(resolve(root, path));
  log(`卡面整理完成：更新 ${result.changedCards} 张卡片，新增 ${result.images.length} 个图片文件，清理 ${result.deletedImages.length} 个未引用图片。`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  localizeCardsFile().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
