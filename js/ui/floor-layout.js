/** 모든 파일의 앞면이 보이도록 펼치고 회전만 조금씩 달리한다. 실제 분류·목적지는 바꾸지 않는다. */
import { LAYOUT_DEFAULTS, createRandom, groupItems, hashString, rectsOverlap } from "./layout.js";

export const FLOOR_LAYOUT = Object.freeze({
  rotation: 7,
  gap: 12,
});

/** 회전까지 포함한 보수적인 범위. 기존 파일을 새 파일로 덮지 않을 때도 쓴다. */
export function rotatedRect({ x, y, width, height, rot = 0 }) {
  const angle = Math.abs(rot) * Math.PI / 180;
  const w = width * Math.abs(Math.cos(angle)) + height * Math.abs(Math.sin(angle));
  const h = height * Math.abs(Math.cos(angle)) + width * Math.abs(Math.sin(angle));
  return { x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h };
}

/** 한 자리에는 한 파일만 놓는다. 회전한 모서리까지 간격을 확보한다. */
export function floorSlots(bounds, config = {}, seed = 0) {
  const card = { ...LAYOUT_DEFAULTS.card, ...config.card };
  const cfg = { ...FLOOR_LAYOUT, ...config.floor };
  const rotated = rotatedRect({ x: 0, y: 0, ...card, rot: cfg.rotation });
  const width = Math.ceil(rotated.width);
  const height = Math.ceil(rotated.height);
  const cols = Math.floor((bounds.width + cfg.gap) / (width + cfg.gap));
  const rows = Math.floor((bounds.height + cfg.gap) / (height + cfg.gap));
  if (cols <= 0 || rows <= 0) return [];
  const originX = bounds.x + (bounds.width - (cols * width + (cols - 1) * cfg.gap)) / 2;
  const originY = bounds.y + (bounds.height - (rows * height + (rows - 1) * cfg.gap)) / 2;

  const random = createRandom(seed);
  const slots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        x: originX + col * (width + cfg.gap) + (width - card.width) / 2,
        y: originY + row * (height + cfg.gap) + (height - card.height) / 2,
        rot: (random() * 2 - 1) * cfg.rotation,
        order: slots.length,
      });
    }
  }
  return slots;
}

export function floorSlotCount(bounds, config) {
  return floorSlots(bounds, config).length;
}

export function placeFloorItems({ items, bounds, existing = [], seed, config = {} }) {
  if (!items?.length) return new Map();
  const randomSeed = seed ?? hashString(items.map(item => item.name).sort().join("|"));
  const occupied = existing.map(rotatedRect);
  const card = { ...LAYOUT_DEFAULTS.card, ...config.card };
  // 수동 보충도 겹침 없이 놓는다. 사용자가 옮겨 놓은 파일의 회전 범위까지 확인한다.
  const available = floorSlots(bounds, config, randomSeed)
    .filter(slot => !occupied.some(rect => rectsOverlap(rotatedRect({ ...slot, ...card }), rect, 1)));
  const groups = [...groupItems(items)].sort(([a, left], [b, right]) =>
    right.length - left.length || (a < b ? -1 : 1));
  const result = new Map();
  for (const [group, members] of groups) {
    for (const item of members) {
      const slot = available.shift();
      if (!slot) return result;
      result.set(item.id, { x: slot.x, y: slot.y, rot: slot.rot, group, order: slot.order });
    }
  }
  return result;
}
