import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const studio = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const whiteLetterIds = new Set(['bank-logo', 'bank-name', 'bank-english', 'product-name']);

function convexHull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const chain = values => {
    const result = [];
    for (const point of values) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  return [...chain(points).slice(0, -1), ...chain([...points].reverse()).slice(0, -1)];
}

// Chips and solid network badges have an opaque interior. Their printed letters
// can match the card background, so a colour difference alone leaves false holes.
async function fillInterior(alpha, width, height) {
  const seen = new Uint8Array(alpha.length), components = [];
  for (let start = 0; start < alpha.length; start++) {
    if (seen[start] || alpha[start] < 48) continue;
    const pixels = [start];
    seen[start] = 1;
    for (let head = 0; head < pixels.length; head++) {
      const at = pixels[head], x = at % width, y = Math.floor(at / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[next] || alpha[next] < 48) continue;
        seen[next] = 1;
        pixels.push(next);
      }
    }
    components.push(pixels);
  }
  const largest = Math.max(0, ...components.map(component => component.length));
  const points = components.filter(component => component.length >= Math.max(8, largest * .04))
    .flatMap(component => component.map(at => [at % width + .5, Math.floor(at / width) + .5]));
  if (points.length < 3) throw new Error('无法确定图层主体轮廓');
  const hull = convexHull(points);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${hull.map(point => point.join(',')).join(' ')}" fill="white"/></svg>`;
  const fill = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();
  return Buffer.from(alpha.map((value, index) => Math.max(value, fill[index])));
}

const selected = process.argv.slice(2);
const ids = selected.length ? selected : (await readdir(studio, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => entry.name);
let changed = 0;
for (const id of ids) {
  let entry;
  try { entry = JSON.parse(await readFile(resolve(studio, id, 'index.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (entry.status !== 'ready') continue;
  for (const element of entry.elements) {
    const whiteSunflower = id === 'cmb-sunflower-mastercard-cny' && whiteLetterIds.has(element.id);
    const whiteWeLab = id === 'welab-hk-mastercard-debit' && ['bank-logo', 'bank-name'].includes(element.id);
    const white = whiteSunflower || whiteWeLab;
    const candidate = element.kind === 'chip' || element.id === 'unionpay-logo' || element.id === 'amex-logo';
    if (!white && !candidate) continue;
    const path = resolve(studio, id, element.image);
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (element.id === 'amex-logo') {
      let blue = 0;
      for (let p = 0; p < data.length; p += 4) if (data[p + 2] > 110 && data[p] < 100 && data[p + 3] > 48) blue++;
      // A bare AMERICAN EXPRESS wordmark must keep the spaces between letters.
      if (blue / (info.width * info.height) < .2) continue;
    }
    const baseline = resolve(studio, '_processing', 'alpha', id, `${element.id}.png`);
    let alpha;
    try {
      const original = await sharp(await readFile(baseline)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
      if (original.info.width !== info.width || original.info.height !== info.height || original.info.channels !== 1) throw new Error(`${id}/${element.id} 的原始 alpha 尺寸已改变，请重新保存该基线`);
      alpha = original.data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      alpha = Buffer.alloc(info.width * info.height);
      for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
      await mkdir(dirname(baseline), { recursive: true });
      await sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } }).toColourspace('b-w').png().toFile(baseline);
    }
    let refined;
    if (white) {
      refined = Buffer.alloc(alpha.length);
      for (let p = 0; p < refined.length; p++) {
        const rgb = data.subarray(p * 4, p * 4 + 3);
        const light = (rgb[0] + rgb[1] + rgb[2]) / 3;
        refined[p] = whiteWeLab
          ? Math.max(alpha[p], Math.max(0, Math.min(255, (Math.min(...rgb) - 230) * 255 / 5)))
          : Math.max(...rgb) - Math.min(...rgb) < 30 ? Math.max(0, Math.min(255, (light - 215) * 255 / 22)) : 0;
      }
    } else {
      if (id === 'cgb-amex-lucky-debit-370330' && element.kind === 'chip') {
        // The neighbouring pink Lucky stroke falls inside this crop. Only the
        // neutral metal and its dark grooves belong to the chip.
        alpha = Buffer.from(alpha.map((value, p) => {
          const rgb = data.subarray(p * 4, p * 4 + 3);
          return Math.max(...rgb) - Math.min(...rgb) < 25 ? value : 0;
        }));
      }
      if (id === 'czb-business-debit-622309' && element.id === 'unionpay-logo') {
        // The inpainted red background also changed a nearby decorative arc.
        // The white badge frame gives its actual outline without that arc.
        alpha = Buffer.from(alpha.map((value, p) =>
          Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) > 215 ? value : 0));
      }
      refined = await fillInterior(alpha, info.width, info.height);
    }
    for (let p = 0; p < refined.length; p++) data[p * 4 + 3] = refined[p];
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(path);
    changed++;
    console.log(`${id}/${element.id}: ${white ? '白色笔画' : '主体内部不透明'}`);
  }
}
console.log(`已处理 ${changed} 个图层，RGB 和坐标保持不变。`);
