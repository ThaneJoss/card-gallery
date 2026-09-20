import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_SHAPE, fitCardFace, posterTransform } from '../src/card-presentation.mjs';

test('横竖大图共用标准卡体比例，在桌面和手机留出相同边距并居中', () => {
  for (const [width, height] of [[912, 440], [272, 384], [560, 240]]) for (const portrait of [false, true]) {
    const frame = fitCardFace(width, height, portrait);
    const ratio = portrait ? CARD_SHAPE.height / CARD_SHAPE.width : CARD_SHAPE.width / CARD_SHAPE.height;
    assert.ok(Math.abs(frame.width / frame.height - ratio) < 1e-12);
    assert.ok(frame.left >= 24 - 1e-12 && frame.top >= 24 - 1e-12);
    assert.ok(Math.abs(frame.left * 2 + frame.width - width) < 1e-12);
    assert.ok(Math.abs(frame.top * 2 + frame.height - height) < 1e-12);
  }
});

test('照片大图的 CSS 透视变换将卡面四角映射到与模型相同的矩形', () => {
  const corners = [[.237, .266], [.685, .259], [.777, .674], [.194, .674]];
  const width = 250, height = 395;
  const matrix = posterTransform(width, height, corners).slice(9, -1).split(',').map(Number);
  const destination = [[0, 0], [width, 0], [width, height], [0, height]];
  corners.forEach(([u, v], i) => {
    const x = u * width, y = v * height;
    const w = matrix[3] * x + matrix[7] * y + matrix[15];
    const point = [(matrix[0] * x + matrix[4] * y + matrix[12]) / w,
      (matrix[1] * x + matrix[5] * y + matrix[13]) / w];
    assert.ok(point.every((value, axis) => Math.abs(value - destination[i][axis]) < 1e-9));
  });
  assert.equal(posterTransform(width, height), 'none');
});
