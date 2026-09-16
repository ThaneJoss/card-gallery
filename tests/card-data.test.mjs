import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { parseCards } from '../scripts/card-data.mjs';

const minimalCard = {
  名称: '我的卡片', 银行: '中国银行', 类型: '信用卡', 图片: 'https://example.com/card.jpg'
};

test('中文 YAML 支持注释、图片直链、单项和多项卡组织，并自动生成编号', () => {
  const cards = parseCards(`
# 按排列顺序展示
- 名称: 我的旅行卡
  银行: 中国银行
  类型: 信用卡
  图片: https://example.com/card.jpg?size=large&v=2#front
  卡组织:
    - Visa
    - 银联
    - VISA

- 名称: 日常储蓄卡
  银行: 招商银行
  类型: 储蓄卡
  图片: ./assets/cards/local.webp
  卡组织: 银联
  编号: everyday
`);
  assert.deepEqual(cards, [
    {
      id: 'card-1', name: '我的旅行卡', bank: '中国银行', type: 'credit',
      image: 'https://example.com/card.jpg?size=large&v=2#front',
      networks: ['visa', 'unionpay']
    },
    {
      id: 'everyday', name: '日常储蓄卡', bank: '招商银行', type: 'debit',
      image: './assets/cards/local.webp', networks: ['unionpay']
    }
  ]);
});

test('只需填写四个必填字段，清空文件可以清空收藏', () => {
  const cards = parseCards(stringify([minimalCard]));
  assert.equal(cards[0].id, 'card-1');
  assert.deepEqual(cards[0].networks, []);
  assert.deepEqual(parseCards(''), []);
  assert.deepEqual(parseCards('# 暂时没有卡片\n'), []);
});

test('YAML 语法和重复字段错误包含文件名及出错位置', () => {
  for (const source of ['- 名称: 我的卡\n  银行: [中国银行\n', '- 名称: 第一张\n  名称: 第二张\n']) {
    assert.throws(() => parseCards(source), error => {
      assert.match(error.message, /cards.yaml 格式错误/);
      assert.match(error.message, /line \d+, column \d+/);
      return true;
    });
  }
});

test('字段拼写、必填项、类型和卡组织错误均能定位到具体卡片', () => {
  const invalidCards = [
    [{ ...minimalCard, 图篇: minimalCard.图片 }, /未知字段「图篇」/],
    [{ ...minimalCard, 图片: '' }, /「图片」须为非空文本/],
    [{ ...minimalCard, 类型: 'credit' }, /「类型」请填写「信用卡」或「储蓄卡」/],
    [{ ...minimalCard, 卡组织: 'Visaa' }, /卡组织「Visaa」无效/],
    [{ ...minimalCard, 卡组织: [123] }, /「卡组织」须为文本或文本列表/]
  ];
  for (const [entry, message] of invalidCards) {
    assert.throws(() => parseCards(stringify([minimalCard, entry])), error => {
      assert.match(error.message, /第 2 张卡片/);
      assert.match(error.message, message);
      return true;
    });
  }
});
