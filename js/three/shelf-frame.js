/** 수납함 위치는 그대로 두고, 인접한 칸의 가구 판/기둥을 공유한다. Three/DOM 없음. */
const round = value => Math.round(value * 1e5) / 1e5;

function mergeSpans(spans) {
  const merged = [];
  for (const span of spans.sort((a, b) => a.left - b.left)) {
    const previous = merged.at(-1);
    if (previous && span.left <= previous.right + 0.05) previous.right = Math.max(previous.right, span.right);
    else merged.push({ ...span });
  }
  return merged;
}

function buildFrame(columns, wall) {
  const { width, depth, yaw, normal } = wall;
  const center = (columns[0].along + columns.at(-1).along) / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const parts = [];
  const add = (kind, size, position) => parts.push({ kind, size, position });
  const boards = new Map(), backs = new Map();
  for (const column of columns) {
    column.left = column.along - center - width / 2 - 0.12;
    column.right = column.along - center + width / 2 + 0.12;
    column.bottom = Math.min(...column.slots.map(slot => slot.y)) - 0.12;
    column.top = Math.max(...column.slots.map(slot => slot.y + slot.height)) + 0.25;
    for (const slot of column.slots) for (const y of [slot.y - 0.06, slot.y + slot.height + 0.19]) {
      const key = round(y);
      if (!boards.has(key)) boards.set(key, []);
      boards.get(key).push({ left: column.left, right: column.right });
    }
    const key = `${round(column.bottom)}:${round(column.top)}`;
    if (!backs.has(key)) backs.set(key, { bottom: column.bottom, top: column.top, spans: [] });
    backs.get(key).spans.push({ left: column.left, right: column.right });
  }
  for (const [y, spans] of boards) for (const span of mergeSpans(spans)) {
    add("board", [span.right - span.left, 0.12, depth + 0.32], [(span.left + span.right) / 2, y, 0]);
  }
  for (const { bottom, top, spans } of backs.values()) for (const span of mergeSpans(spans)) {
    add("back", [span.right - span.left, top - bottom, 0.08],
      [(span.left + span.right) / 2, (bottom + top) / 2, -depth / 2 - 0.12]);
  }
  for (let i = 0; i <= columns.length; i++) {
    const left = columns[i - 1], right = columns[i];
    const bottom = Math.min(left?.bottom ?? Infinity, right?.bottom ?? Infinity);
    const top = Math.max(left?.top ?? -Infinity, right?.top ?? -Infinity);
    const x = left && right ? (left.right + right.left) / 2 : left?.right ?? right.left;
    add("divider", [0.08, top - bottom, depth + 0.32], [x, (bottom + top) / 2, 0]);
  }
  const bottom = Math.min(...columns.map(column => column.bottom));
  if (bottom > 0) {
    // 긴 장도 중간 다리로 받친다. 칸마다 두 다리를 반복하지 않는다.
    const feet = [columns[0].left + 0.12, columns.at(-1).right - 0.12];
    for (let i = 2; i < columns.length; i += 2) feet.push((columns[i - 1].right + columns[i].left) / 2);
    for (const x of feet) add("foot", [0.12, bottom, depth * 0.8], [x, bottom / 2, 0]);
  }
  return {
    x: center * c + normal * s, z: -center * s + normal * c, yaw,
    slotIds: columns.flatMap(column => column.slots.map(slot => slot.slotId)), parts,
  };
}

/** 같은 벽의 연속된 칸만 묶는다. 가구 사이의 빈 구간/다른 방향으로 판을 잇지 않는다. */
export function shelfFrames(slots) {
  const walls = new Map();
  for (const slot of slots) {
    const yaw = slot.yaw ?? 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const along = round(slot.x * c - slot.z * s);
    const normal = round(slot.x * s + slot.z * c);
    const key = `${round(yaw)}:${normal}:${slot.width}:${slot.depth}`;
    if (!walls.has(key)) walls.set(key, { yaw, normal, width: slot.width, depth: slot.depth, columns: new Map() });
    const wall = walls.get(key);
    if (!wall.columns.has(along)) wall.columns.set(along, { along, slots: [] });
    const column = wall.columns.get(along);
    if (!column.slots.some(other => Math.abs(other.y - slot.y) < 0.001)) column.slots.push(slot);
  }
  const frames = [];
  for (const wall of walls.values()) {
    let run = [];
    for (const column of [...wall.columns.values()].sort((a, b) => a.along - b.along)) {
      if (run.length && column.along - run.at(-1).along > wall.width + 0.3) {
        frames.push(buildFrame(run, wall)); run = [];
      }
      run.push(column);
    }
    if (run.length) frames.push(buildFrame(run, wall));
  }
  return frames;
}
