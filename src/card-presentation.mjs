export const CARD_SHAPE = { width: 8.53, height: 5.4, corner: .28, faceZ: .061 };

/** Fit the front-facing card in CSS pixels, with room for its rounded edges. */
export function fitCardFace(viewportWidth, viewportHeight, portrait) {
  const width = portrait ? CARD_SHAPE.height : CARD_SHAPE.width;
  const height = portrait ? CARD_SHAPE.width : CARD_SHAPE.height;
  const scale = Math.max(0, Math.min((viewportWidth - 48) / width, (viewportHeight - 48) / height));
  return { left: (viewportWidth - width * scale) / 2, top: (viewportHeight - height * scale) / 2,
    width: width * scale, height: height * scale, radius: CARD_SHAPE.corner * scale, scale };
}

/** Card units are centimetres: view the face from 40 cm, regardless of viewport. */
export function fitCardCamera(viewportWidth, viewportHeight, portrait) {
  const { scale } = fitCardFace(viewportWidth, viewportHeight, portrait);
  const viewingDistance = 40;
  const tangent = viewportHeight / (2 * scale * viewingDistance);
  return { distance: viewingDistance + CARD_SHAPE.faceZ, tangent, fov: 2 * Math.atan(tangent) * 180 / Math.PI };
}
