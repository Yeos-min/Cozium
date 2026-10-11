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
  // slotArea: 처음 깔리는 칸만 이 안에 둔다(다락방: 바닥 가운데). 내려놓기는 bounds 전체에서 된다.
  bounds = config.slotArea ?? bounds;
  const card = { ...LAYOUT_DEFAULTS.card, ...config.card };
  const cfg = { ...FLOOR_LAYOUT, ...config.floor };
  // baseRotation: 모든 칸을 같은 방향으로 돌려 놓는다(다락방: 카드 위쪽이 상자 벽을 보게 90°). 흔들림은 그 위에.
  const base = cfg.baseRotation ?? 0;
  const rotated = rotatedRect({ x: 0, y: 0, ...card, rot: Math.abs(base) + cfg.rotation });
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
        rot: base + (random() * 2 - 1) * cfg.rotation,
        order: slots.length,
        row, col,
      });
    }
  }
  // centerFirst: 가운데 칸부터 쓴다(세로 줄 가운데 → 바깥, 같은 거리면 가로 순서). order는 그대로 둔다.
  if (cfg.centerFirst) {
    const mid = (rows - 1) / 2;
    slots.sort((a, b) => Math.abs(a.row - mid) - Math.abs(b.row - mid) || a.row - b.row || a.col - b.col);
  }
  return slots.map(({ row, col, ...slot }) => slot);
}

export function floorSlotCount(bounds, config) {
  return floorSlots(bounds, config).length;
}

/**
 * config.home(item)가 "floor"가 아닌 자리(예: 다락방의 핀보드·책 더미)를 돌려주면, 그 자리의 정원
 * (config.homeCapacity[home]) 안에서는 바닥 슬롯을 쓰지 않고 `home`만 표시한다. 정원이 차면 바닥에 깔린다.
 * 자리 안에서 어디에 놓일지는 장면이 정한다. 기존 항목 중 home이 있는 것은 그 정원을 차지할 뿐 바닥을 막지 않는다.
 */
export function placeFloorItems({ items, bounds, existing = [], seed, config = {} }) {
  if (!items?.length) return new Map();
  const randomSeed = seed ?? hashString(items.map(item => item.name).sort().join("|"));
  const homeOf = typeof config.home === "function" ? config.home : null;
  const capacity = config.homeCapacity ?? {};
  const used = {};
  for (const rect of existing) if (rect.home) used[rect.home] = (used[rect.home] ?? 0) + 1;
  const occupied = existing.filter(rect => !rect.home).map(rotatedRect);
  const card = { ...LAYOUT_DEFAULTS.card, ...config.card };
  // 수동 보충도 겹침 없이 놓는다. 사용자가 옮겨 놓은 파일의 회전 범위까지 확인한다.
  const available = floorSlots(bounds, config, randomSeed)
    .filter(slot => !occupied.some(rect => rectsOverlap(rotatedRect({ ...slot, ...card }), rect, 1)));
  const groups = [...groupItems(items)].sort(([a, left], [b, right]) =>
    right.length - left.length || (a < b ? -1 : 1));
  const result = new Map();
  for (const [group, members] of groups) {
    for (const item of members) {
      const home = homeOf?.(item);
      if (home && home !== "floor" && (used[home] ?? 0) < (capacity[home] ?? Infinity)) {
        used[home] = (used[home] ?? 0) + 1;
        result.set(item.id, { x: bounds.x, y: bounds.y, rot: 0, group, order: -1, home });
        continue;
      }
      const slot = available.shift();
      if (!slot) continue;
      result.set(item.id, { x: slot.x, y: slot.y, rot: slot.rot, group, order: slot.order });
    }
  }
  return result;
}
