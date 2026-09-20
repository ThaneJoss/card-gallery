const FULL_IMAGE = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Row-major homography from a unit square to TL/TR/BR/BL image coordinates. */
export function homographyFromCorners(corners) {
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some(point =>
    !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1))) {
    throw new RangeError('卡面四角必须是四个归一化坐标');
  }
  const turns = corners.map((a, i) => {
    const b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  if (!turns.every(value => value > 1e-12) && !turns.every(value => value < -1e-12)) {
    throw new RangeError('卡面四角必须依次围成非退化凸四边形');
  }
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

function multiply(a, b) {
  return Array.from({ length: 9 }, (_, i) => {
    const row = Math.floor(i / 3), column = i % 3;
    return a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
  });
}

/** Maps local bottom-left UVs to source bottom-left UVs without rebuilding geometry. */
export function createCardTextureMapping({ width, height, textureCorners = FULL_IMAGE }) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new RangeError('卡面图片尺寸无效');
  }
  const homography = homographyFromCorners(textureCorners);
  const edgeLength = (a, b) => Math.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height);
  const [tl, tr, br, bl] = textureCorners;
  const portrait = edgeLength(tl, bl) + edgeLength(tr, br) > edgeLength(tl, tr) + edgeLength(bl, br);
  // Portrait designs rotate the fixed card +90 degrees; compensate its local UV axes.
  const localToDesign = portrait ? [0, -1, 1, -1, 0, 1, 0, 0, 1] : [1, 0, 0, 0, -1, 1, 0, 0, 1];
  const sourceToTexture = [1, 0, 0, 0, -1, 1, 0, 0, 1];
  return { portrait, projection: multiply(sourceToTexture, multiply(homography, localToDesign)) };
}
