import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const fields = new Set(['名称', '银行', '类型', '图片', '卡组织', '编号']);
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
    const cardNetworks = list('卡组织').map(name => {
      const network = networks.get(name.toLowerCase());
      if (!network) throw new Error(`${label}的卡组织「${name}」无效，可填写 Visa、Mastercard、银联、Amex、JCB 或 Discover。`);
      return network;
    });
    return {
      id, name: text('名称'), bank: text('银行'), type,
      networks: [...new Set(cardNetworks)],
      image: text('图片')
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
