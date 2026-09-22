import { CARD_SHAPE } from './card-presentation.mjs';

export const CARD_VIEWS = { hd: '高清卡面', clean: '纯底图', layers: '分层展示', original: '原始卡面' };
export const ELEMENT_KINDS = { logo: '标志', text: '文字', chip: '芯片', other: '其他' };

export function cardView(card, view) {
  if (!Object.hasOwn(CARD_VIEWS, view)) throw new RangeError('未知卡面视图');
  if (view === 'original' || card.studio?.status !== 'ready') {
    return { image: card.image, textureCorners: card.textureCorners, layers: [] };
  }
  return { image: view === 'hd' ? card.studio.hd : card.studio.clean,
    layers: view === 'layers' ? card.studio.elements : [] };
}

/** Coordinates in the upright design plane, before compensating the card's portrait rotation. */
export function layerPlacement(box, portrait) {
  const width = portrait ? CARD_SHAPE.height : CARD_SHAPE.width;
  const height = portrait ? CARD_SHAPE.width : CARD_SHAPE.height;
  const [x, y, w, h] = box;
  return { x: (x + w / 2 - .5) * width, y: (.5 - y - h / 2) * height, width: w * width, height: h * height };
}
