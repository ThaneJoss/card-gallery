import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const fields = new Set(['名称', '银行', '类型', '图片', '卡组织', '编号', 'bin', '贴图四角']);
const types = new Map([['信用卡', 'credit'], ['储蓄卡', 'debit']]);
const networks = new Map([
  ['visa', 'visa'], ['mastercard', 'mastercard'], ['万事达', 'mastercard'],
  ['unionpay', 'unionpay'], ['银联', 'unionpay'],
  ['amex', 'amex'], ['american express', 'amex'], ['美国运通', 'amex'],
  ['jcb', 'jcb'], ['discover', 'discover']
]);

export function parseCards(source) {
  let entries;
  try {
    entries = parse(source) ?? [];
  } catch (error) {
    throw new Error(`cards.yaml 格式错误，请检查提示位置的缩进和冒号：\n${error.message}`, { cause: error });
  }
  if (!Array.isArray(entries)) throw new Error('cards.yaml 必须是卡片列表，每张卡片以「- 名称:」开头。');
  const ids = new Set();
  return entries.map((entry, index) => {
    const label = `cards.yaml 第 ${index + 1} 张卡片`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label}需要填写名称、银行、类型和图片。`);
    }
    for (const field of Object.keys(entry)) {
      if (!fields.has(field)) throw new Error(`${label}存在未知字段「${field}」，请使用：${[...fields].join('、')}。`);
    }
    const text = (field, required = true) => {
      const value = entry[field];
      if (!required && value == null) return '';
      if (typeof value !== 'string' || (required && !value.trim())) {
        throw new Error(`${label}的「${field}」须为${required ? '非空' : ''}文本。`);
      }
      return value.trim();
    };
    const list = (field) => {
      const value = entry[field] ?? [];
      if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.trim())) {
        throw new Error(`${label}的「${field}」须为文本或文本列表。`);
      }
      return value.map(item => item.trim());
    };

    const id = text('编号', false) || `card-${index + 1}`;
    if (ids.has(id)) throw new Error(`${label}的编号「${id}」重复，请修改或省略编号。`);
    ids.add(id);
    const type = types.get(text('类型'));
    if (!type) throw new Error(`${label}的「类型」请填写「信用卡」或「储蓄卡」。`);
    let bin;
    if (Object.hasOwn(entry, 'bin')) {
      if (!['string', 'number'].includes(typeof entry.bin) || !/^\d{6}(?:\d{2})?$/.test(String(entry.bin).trim())) {
        throw new Error(`${label}的「bin」须为 6 位或 8 位数字，可填写数字或文本。`);
      }
      bin = String(entry.bin).trim();
    }
    const cardNetworks = list('卡组织').map(name => {
      const network = networks.get(name.toLowerCase());
      if (!network) throw new Error(`${label}的卡组织「${name}」无效，可填写 Visa、Mastercard、银联、Amex、JCB 或 Discover。`);
      return network;
    });
    const textureCorners = entry['贴图四角'];
    if (Object.hasOwn(entry, '贴图四角')) {
      if (!Array.isArray(textureCorners) || textureCorners.length !== 4 || !textureCorners.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1))) {
        throw new Error(`${label}的「贴图四角」须按左上、右上、右下、左下填写四个 [x, y] 坐标，数值范围为 0–1。`);
      }
      const turns = textureCorners.map((a, i) => {
        const b = textureCorners[(i + 1) % 4], c = textureCorners[(i + 2) % 4];
        return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      });
      if (!turns.every(turn => turn > 0)) throw new Error(`${label}的「贴图四角」须按顺时针形成不交叉的凸四边形。`);
    }
    return {
      id, name: text('名称'), bank: text('银行'), type,
      networks: [...new Set(cardNetworks)],
      image: text('图片'),
      ...(textureCorners ? { textureCorners } : {}),
      ...(bin ? { bin } : {})
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '../cards.yaml');
  readFile(source, 'utf8').then(parseCards).then(cards => {
    console.log(`cards.yaml 检查通过：${cards.length} 张卡片。`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
