import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import sharp from 'sharp';

const kinds = new Set(['logo', 'text', 'chip', 'other']);

/** Publish only complete card asset sets; source cards can exist without a studio set. */
export async function publishCardStudio({ root, output, cardId }) {
  const folder = encodeURIComponent(cardId);
  const source = resolve(root, 'assets/card-studio', folder);
  let entry;
  try {
    entry = JSON.parse(await readFile(resolve(source, 'index.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  if (entry.version !== 1 || entry.cardId !== cardId) throw new Error('图层资料版本或卡片编号不匹配');
  if (!Array.isArray(entry.notes) || entry.notes.some(note => typeof note !== 'string')) throw new Error('图层说明须为文本列表');
  if (entry.status === 'placeholder') return { status: 'placeholder', notes: entry.notes };
  if (entry.status !== 'ready') throw new Error('图层资料状态无效');
  if (![entry.width, entry.height].every(value => Number.isInteger(value) && value > 0)) throw new Error('高清卡面尺寸无效');
  if (!Array.isArray(entry.elements)) throw new Error('图层须为列表');

  const target = resolve(output, 'studio', folder);
  const url = file => `./studio/${folder}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const local = file => {
    if (typeof file !== 'string' || !file || file.includes('\\') || file.startsWith('/') || /^[a-z]+:/i.test(file)) throw new Error('图层图片须使用目录内相对路径');
    const path = resolve(source, file);
    if (!path.startsWith(source + sep)) throw new Error('图层图片不能超出本卡素材目录');
    return path;
  };
  const publish = async (file, layer) => {
    const image = sharp(local(file));
    const metadata = await image.metadata();
    if (layer) {
      const expected = [layer.box[2] * entry.width, layer.box[3] * entry.height];
      if (Math.abs(metadata.width - expected[0]) > 1 || Math.abs(metadata.height - expected[1]) > 1) throw new Error(`「${layer.label}」的图片尺寸与坐标不一致`);
      if (metadata.format !== 'png' || !metadata.hasAlpha) throw new Error(`「${layer.label}」须为透明 PNG`);
      const alpha = (await image.stats()).channels[metadata.channels - 1];
      if (alpha.min === 255 || alpha.max === 0) throw new Error(`「${layer.label}」须同时包含透明区域与可见内容`);
    } else if (metadata.width !== entry.width || metadata.height !== entry.height) {
      throw new Error('高清卡面与干净底图须使用相同的记录尺寸');
    }
    await mkdir(dirname(resolve(target, file)), { recursive: true });
    await cp(local(file), resolve(target, file));
    return url(file);
  };

  const ids = new Set();
  for (const element of entry.elements) {
    if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id)) throw new Error('图层编号须为不重复的非空文本');
    ids.add(element.id);
    if (typeof element.label !== 'string' || !element.label || !kinds.has(element.kind)) throw new Error('图层名称或类型无效');
    if (element.text !== undefined && typeof element.text !== 'string') throw new Error('图层文字须为文本');
    const box = element.box;
    if (!Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isFinite(value)) ||
      box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1 + 1e-6 || box[1] + box[3] > 1 + 1e-6) throw new Error(`「${element.label}」须使用卡面内的归一化坐标`);
  }
  const hd = await publish(entry.hd);
  const clean = await publish(entry.clean);
  const elements = [];
  for (const element of entry.elements) {
    elements.push({ ...element, image: await publish(element.image, element),
      pixels: element.box.map((value, index) => Math.round(value * (index % 2 ? entry.height : entry.width))) });
  }
  await sharp(local(entry.hd)).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 }).toFile(resolve(target, 'thumbnail.webp'));
  await writeFile(resolve(target, 'index.json'), JSON.stringify({ ...entry, coordinateOrigin: 'top-left',
    elements: entry.elements.map((element, index) => ({ ...element, pixels: elements[index].pixels })) }, null, 2) + '\n');
  return { status: 'ready', width: entry.width, height: entry.height, hd, clean,
    thumbnail: url('thumbnail.webp'), manifest: url('index.json'), elements, notes: entry.notes };
}
