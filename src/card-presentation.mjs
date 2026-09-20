import { homographyFromCorners } from './card-texture.mjs';

export const CARD_SHAPE = { width: 8.53, height: 5.4, corner: .28, faceZ: .061 };

/** The poster and the front-facing camera share this exact CSS-pixel rectangle. */
export function fitCardFace(viewportWidth, viewportHeight, portrait) {
  const width = portrait ? CARD_SHAPE.height : CARD_SHAPE.width;
  const height = portrait ? CARD_SHAPE.width : CARD_SHAPE.height;
  const scale = Math.max(0, Math.min((viewportWidth - 48) / width, (viewportHeight - 48) / height));
  return { left: (viewportWidth - width * scale) / 2, top: (viewportHeight - height * scale) / 2,
    width: width * scale, height: height * scale, radius: CARD_SHAPE.corner * scale, scale };
}

/** CSS projects the original photograph into the same card region sampled by WebGL. */
export function posterTransform(width, height, corners) {
  if (!corners) return 'none';
  const [a, b, c, d, e, f, g, h, i] = homographyFromCorners(corners);
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const m = [e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d].map(value => value / determinant);
  return `matrix3d(${[m[0], m[3] * height / width, 0, m[6] / width,
    m[1] * width / height, m[4], 0, m[7] / height,
    0, 0, 1, 0, m[2] * width, m[5] * height, 0, m[8]].join(',')})`;
}
