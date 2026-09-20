import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCardTextureMapping, homographyFromCorners } from '../src/card-texture.mjs';

const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
const project = (matrix, [x, y]) => {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator];
};
const near = (actual, expected) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-10));

test('单应矩阵准确映射非平行照片四角，而非仅作仿射缩放', () => {
  const corners = [[.2, .15], [.85, .22], [.7, .9], [.1, .8]];
  const homography = homographyFromCorners(corners);
  square.forEach((point, index) => near(project(homography, point), corners[index]));
  assert.ok(Math.abs(homography[6]) + Math.abs(homography[7]) > .01);
});

test('横版整图保持原始 UV，不翻转或裁切', () => {
  const mapping = createCardTextureMapping({ width: 856, height: 540 });
  assert.equal(mapping.portrait, false);
  for (const uv of [...square, [.23, .71]]) near(project(mapping.projection, uv), uv);
});

test('竖版 UV 补偿通用模型的正向九十度朝向，保持图案直立', () => {
  const mapping = createCardTextureMapping({ width: 540, height: 856 });
  assert.equal(mapping.portrait, true);
  // After the card rotates +90 degrees, local top-right is the displayed top-left.
  const displayedCorners = [[1, 1], [1, 0], [0, 0], [0, 1]];
  displayedCorners.forEach((point, i) => near(project(mapping.projection, point), [square[i][0], 1 - square[i][1]]));
});

test('照片卡片朝向按四角像素边长确定，而非整张照片比例', () => {
  const corners = [[.35, .1], [.65, .1], [.65, .9], [.35, .9]];
  const mapping = createCardTextureMapping({ width: 1200, height: 900, textureCorners: corners });
  assert.equal(mapping.portrait, true);
  const displayedCorners = [[1, 1], [1, 0], [0, 0], [0, 1]];
  displayedCorners.forEach((point, i) => near(project(mapping.projection, point), [corners[i][0], 1 - corners[i][1]]));
  // The same normalized rectangle is wide on a sufficiently wide image.
  assert.equal(createCardTextureMapping({ width: 4000, height: 900, textureCorners: corners }).portrait, false);
});

test('横版透视区域采样只对应指定源图四角', () => {
  const corners = [[.1, .3], [.9, .2], [.85, .7], [.12, .75]];
  const mapping = createCardTextureMapping({ width: 1200, height: 900, textureCorners: corners });
  assert.equal(mapping.portrait, false);
  const localCorners = [[0, 1], [1, 1], [1, 0], [0, 0]];
  localCorners.forEach((point, i) => near(project(mapping.projection, point), [corners[i][0], 1 - corners[i][1]]));
});

test('拒绝重复、交叉、退化或非归一化四角及无效图片尺寸', () => {
  for (const corners of [
    [[0, 0], [0, 0], [1, 1], [0, 1]],
    [[0, 0], [1, 1], [1, 0], [0, 1]],
    [[0, 0], [.2, .2], [.4, .4], [.6, .6]],
    [[-.1, 0], [1, 0], [1, 1], [0, 1]],
    [[NaN, 0], [1, 0], [1, 1], [0, 1]],
  ]) assert.throws(() => homographyFromCorners(corners), RangeError);
  assert.throws(() => createCardTextureMapping({ width: 0, height: 540 }), RangeError);
});
