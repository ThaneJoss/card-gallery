import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_SHAPE, fitCardFace, fitCardCamera } from '../src/card-presentation.mjs';

test('自然视距下正面投影符合横竖卡片布局，调整窗口不改变观察距离', () => {
  const distances = [];
  for (const [width, height] of [[912, 440], [272, 384], [560, 240]]) for (const portrait of [false, true]) {
    const frame = fitCardFace(width, height, portrait);
    const camera = fitCardCamera(width, height, portrait);
    distances.push(camera.distance);
    const frontDepth = camera.distance - CARD_SHAPE.faceZ;
    const pixelScale = height / (2 * Math.tan(camera.fov * Math.PI / 360) * frontDepth);
    const physicalWidth = portrait ? CARD_SHAPE.height : CARD_SHAPE.width;
    const physicalHeight = portrait ? CARD_SHAPE.width : CARD_SHAPE.height;
    assert.ok(Math.abs(physicalWidth * pixelScale - frame.width) < 1e-9);
    assert.ok(Math.abs(physicalHeight * pixelScale - frame.height) < 1e-9);
    assert.ok(Number.isFinite(camera.fov) && camera.fov > 0 && camera.fov < 45);
  }
  assert.ok(distances.every(distance => distance === distances[0]), '响应式布局只能改变取景，不能让相机贴近卡面');
});

test('旋转45度时近远边透视差保持自然，且不随窗口大小改变', () => {
  for (const portrait of [false, true]) {
    const ratios = [];
    for (const [width, height] of [[912, 440], [272, 384], [560, 240]]) {
      const { distance } = fitCardCamera(width, height, portrait);
      const halfWidth = (portrait ? CARD_SHAPE.height : CARD_SHAPE.width) / 2;
      const angle = Math.PI / 4;
      const faceCenterDepth = distance - CARD_SHAPE.faceZ * Math.cos(angle);
      const nearDepth = faceCenterDepth - halfWidth * Math.sin(angle);
      const farDepth = faceCenterDepth + halfWidth * Math.sin(angle);
      const ratio = farDepth / nearDepth;
      assert.ok(ratio > 1 && ratio < 1.25, `近边相对于远边的放大差过大：${ratio}`);
      ratios.push(ratio);
    }
    assert.ok(ratios.every(ratio => Math.abs(ratio - ratios[0]) < 1e-12));
  }
});

test('横竖卡片共用标准卡体比例，在桌面和手机留出相同边距并居中', () => {
  for (const [width, height] of [[912, 440], [272, 384], [560, 240]]) for (const portrait of [false, true]) {
    const frame = fitCardFace(width, height, portrait);
    const ratio = portrait ? CARD_SHAPE.height / CARD_SHAPE.width : CARD_SHAPE.width / CARD_SHAPE.height;
    assert.ok(Math.abs(frame.width / frame.height - ratio) < 1e-12);
    assert.ok(frame.left >= 24 - 1e-12 && frame.top >= 24 - 1e-12);
    assert.ok(Math.abs(frame.left * 2 + frame.width - width) < 1e-12);
    assert.ok(Math.abs(frame.top * 2 + frame.height - height) < 1e-12);
  }
});
