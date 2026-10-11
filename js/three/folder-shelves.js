import { overlaps } from "./box-placement.js";

/** 같은 폴더는 같은 슬롯을 유지한다. 직접 놓은 상자와 겹치는 신규 슬롯은 건너뛴다. */
export class FolderShelfAssignments {
  #indices = new Map();
  assign(ids, slots, custom = new Map()) {
    if (!slots.length) return new Map();
    const used = new Set(ids.filter(id => this.#indices.has(id)).map(id => this.#indices.get(id)));
    for (const id of ids) {
      if (this.#indices.has(id)) continue;
      let index = 0;
      while (used.has(index) || [...custom].some(([customId, pose]) => {
        if (Math.floor((this.#indices.get(customId) ?? -1) / slots.length) !== Math.floor(index / slots.length)) return false;
        const slot = slots[index % slots.length];
        return pose.y < slot.y + slot.height + 0.25 && pose.y + slot.height > slot.y - 0.12 && overlaps(pose, slot);
      })) {
        index++;
      }
      this.#indices.set(id, index);
      used.add(index);
    }
    return new Map(ids.map(id => [id, this.#indices.get(id)]));
  }
}

/**
 * 정해진 벽 구간을 따라 상자 칸을 놓는다(다락방, 2026-10-11). runs는 attic-room.js의 ATTIC_SHELF_RUNS 꼴.
 * 같은 order의 구간은 번갈아 채운다(양쪽이 같이 차오르게). 두 단, 아래 단부터.
 * wall "z": z = at인 벽(줄이 x를 따라 감), wall "x": x = at인 벽(줄이 z를 따라 감). 상자 앞면(+Z)이 facing 쪽을 본다.
 */
export function wallShelfSlots(runs, box, { shelfY = 0.34, height = box.height, levelGap = 0.25, levels = 2, gap = 0.24 } = {}) {
  const pitch = box.width + gap;
  const columns = runs.map((run) => {
    const sign = Math.sign(run.to - run.from) || 1;
    const length = Math.abs(run.to - run.from);
    const list = [];
    for (let k = 0; k * pitch + box.width <= length + 1e-6; k++) {
      const along = run.from + sign * (k * pitch + box.width / 2);
      const across = run.at + run.facing * (0.12 + box.depth / 2);
      const onX = run.wall === "x";
      // 앞(+Z)을 +x로 돌리려면 yaw +90°, −x로는 −90°
      const yaw = onX ? run.facing * Math.PI / 2 : (run.facing > 0 ? 0 : Math.PI);
      list.push({ x: onX ? across : along, z: onX ? along : across, yaw, width: box.width, depth: box.depth, order: run.order ?? 0, k });
    }
    return list;
  });
  const ordered = [];
  for (const order of [...new Set(runs.map((run) => run.order ?? 0))].sort((a, b) => a - b)) {
    const group = columns.filter((_, i) => (runs[i].order ?? 0) === order);
    const longest = Math.max(0, ...group.map((list) => list.length));
    for (let k = 0; k < longest; k++) for (const list of group) if (list[k]) ordered.push(list[k]);
  }
  return Array.from({ length: levels }, (_, level) => level).flatMap((level) => ordered.map(({ order, k, ...slot }, index) => ({
    ...slot, y: shelfY + level * (height + levelGap), height, slotId: `${level}:${index}`,
  })));
}
