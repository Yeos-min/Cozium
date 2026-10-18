/**
 * attic-room.js — 사용자의 다락방 모델(`models/room.glb`)을 게임 방으로 쓴다. (Claude, 2026-10-11)
 *
 * 모델은 미터, 게임은 1 단위 = 0.5 m(눈높이 3.1 = 1.55 m)라서 ×2로 불러온다. 아래 숫자는 전부 게임 단위다.
 * 모델 좌표(10-11 최종본): 바닥 y = 0, 방 가운데가 원점, 용마루가 z 방향(x = 0), 처마 벽 x = ±4.35 m(높이 약 1.17 m),
 * 박공벽 z = ±2.9 m. 침대·책상·수납장이 +x 쪽, 문은 −z 박공벽 가운데, 핀보드는 +z 박공벽 가운데.
 *
 * 가구 발자국·선반 자리·바닥 범위는 모델에서 잰 상자(scratch 측정, 미터 ×2)를 손으로 옮긴 값이다.
 * 모델을 다시 내보내면 여기를 같이 확인한다. 불러오기에 실패하면 같은 크기의 빈 방(벽·바닥만)이 남는다.
 */
export const ATTIC_URL = "./models/room.glb";
export const ATTIC_SCALE = 2; // 미터 → 게임 단위

/** 안쪽 바닥의 반폭. 벽 두께는 모델에 있다. */
export const ATTIC_HALF = Object.freeze({ x: 8.7, z: 5.8 });

/** 경사 천장 높이(게임 단위). 처마 1.17 m, 용마루 3.9 m, 32° 박공. */
export function atticCeilingAt(x) {
  const eave = 2.34, ridge = 7.8, half = 8.7;
  return eave + (ridge - eave) * Math.max(0, 1 - Math.abs(x) / half);
}

/**
 * 파일 카드가 깔리는 바닥. 침대·책상 쪽(+x), −x 처마 벽의 상자 줄, 책 더미 앞을 비운 사각형.
 * −x 쪽은 천장이 낮아 걸어 들어가지는 못하지만 조준으로 집을 수 있다.
 */
export const ATTIC_FLOOR = Object.freeze({ minX: -7.0, maxX: 2.8, minZ: -5.1, maxZ: 3.5 });

/** 걸을 수 있는 범위. 눈높이(1.55 m)보다 천장이 25 cm 이상 높은 곳까지. */
export const ATTIC_WALK = Object.freeze({ minX: -6.7, maxX: 6.7, minZ: -5.0, maxZ: 5.0 });

/**
 * 시작 자리: 침대와 책상 사이에 서서 상자 벽(−x)을 본다. 파일 카드가 그 사이에 있다(10-11 19시 사용자).
 * yaw는 도(°), 0 = −Z, 90 = −X.
 */
export const ATTIC_SPAWN = Object.freeze({ x: 3.4, z: -0.8, yaw: 90 });

/** 아직 안 꺼낸 더미. 시작 자리 왼쪽, +z 벽 선반 앞. */
export const ATTIC_PILE = Object.freeze({ x: -3.5, z: 4.7 });

/** 걸을 때 부딪히는 가구 (보수적인 사각형, 회전 없음) */
export const ATTIC_OBSTACLES = Object.freeze([
  // throwTop: 던진 파일이 부딪히는 높이(게임 단위, 모델 눈대중 — 10-13 던지기). 걷기에는 안 쓴다(가구는 못 넘음).
  { x: 6.15, z: -3.83, width: 3.9, depth: 3.55, throwTop: 1.2 },  // 침대
  { x: 6.4, z: 1.9, width: 4.1, depth: 3.7, throwTop: 1.7 },      // 책상·의자·노트북
  { x: 4.85, z: 4.6, width: 6.9, depth: 2.1, throwTop: 1.6 },     // 수납장·소품 상자·화분·서류 상자
  { x: 7.32, z: -1.17, width: 1.7, depth: 1.8, throwTop: 1.6 },   // 침대 옆 화분
  { x: 8.2, z: 3.0, width: 1.1, depth: 1.1, throwTop: 1.6 },      // 책상 옆 화분
].map(Object.freeze));

/**
 * 폴더 상자가 놓이는 벽 구간. 앞 = 상자 앞면이 보는 쪽.
 * 10-11 사용자: 침대 반대쪽 낮은 처마 벽(−x)을 따라 한 줄, 선반 틀 없이 바닥에 두고 위에 한 단 더 쌓는다.
 * 처마 높이 1.17 m, 상자 두 단 0.98 m. 벽 가운데부터 양쪽으로 번갈아 채운다(몇 개여도 가운데에 모이게).
 * wall "x" = x가 at인 벽(상자 줄이 z를 따라 감). from/to는 상자 중심이 아니라 **상자 가장자리**의 범위다.
 */
export const ATTIC_SHELF_RUNS = Object.freeze([
  { wall: "x", at: -8.7, facing: 1, from: -0.04, to: -5.65, order: 0 },  // 가운데 → 문 쪽(−z)
  { wall: "x", at: -8.7, facing: 1, from: 0.04, to: 5.65, order: 0 },    // 가운데 → 핀보드 쪽(+z)
].map(Object.freeze));

/** 상자 줄 간격: 옆 상자와 8 cm(게임 0.08 = 4 cm), 위 상자는 아래 상자 테두리 위에 바로 */
export const ATTIC_STACK = Object.freeze({ shelfY: 0, levelGap: 0.01, gap: 0.08 });

/** 핀보드(코르크) 앞면. 사진·메모가 꽂힌다. */
export const ATTIC_PINBOARD = Object.freeze({ x: 0, z: 5.755, minX: -1.4, maxX: 1.4, minY: 2.66, maxY: 4.5, cols: 5, rows: 4, scale: 0.58 });

/** 핀보드 아래 바닥의 책 더미. 문서(pdf·docx·hwp)가 눕혀 쌓인다. */
export const ATTIC_BOOKS = Object.freeze({
  stacks: Object.freeze([
    { x: -1.5, z: 5.3, yaw: 0.06 }, { x: -0.65, z: 5.32, yaw: -0.05 },
    { x: 0.2, z: 5.3, yaw: 0.03 }, { x: 1.0, z: 5.28, yaw: -0.08 },
  ].map(Object.freeze)),
  perStack: 6,
  scale: 0.72,
});

/** 파일 바닥을 논리 좌표로 쓸 때의 크기. 왼쪽 위(minX, minZ)가 논리 (0, 0)이다. */
export function atticFloorBounds(unit) {
  return {
    x: 0, y: 0,
    width: Math.round((ATTIC_FLOOR.maxX - ATTIC_FLOOR.minX) / unit),
    height: Math.round((ATTIC_FLOOR.maxZ - ATTIC_FLOOR.minZ) / unit),
  };
}

/**
 * 다락방의 파일 카드 크기(논리 단위, 1 = 0.01 게임 단위 = 5 mm). 55 × 33 cm.
 * 예전 보드 카드(172 × 104 = 86 × 52 cm)는 실제 크기 가구 옆에서 바닥 타일처럼 보여서 줄였다(10-11).
 */
export const ATTIC_CARD = Object.freeze({ width: 110, height: 66 });

/**
 * 처음 깔리는 칸의 놓는 방향: 카드 위쪽이 상자 벽(−x)을 보게 90° 돌린다. 시작 자리에서 글씨가 바로 읽힌다.
 * 회전 흔들림(±7°)은 그대로. 파일이 적으면 가운데 줄부터 채운다(한쪽으로 쏠리지 않게). (floor-layout의 config.floor)
 */
export const ATTIC_FLOOR_LAYOUT = Object.freeze({ baseRotation: 90, centerFirst: true });

/**
 * 처음 깔리는 칸: 상자 벽과 나란한 6칸 × 시작 자리 쪽으로 4줄(24칸 = 정원). x −3.7 … −0.18 (상자 앞면에서 1.75 m,
 * 시작 자리에서 1.8 m), z는 바닥 가운데. 상자 앞은 비워 둔다(넣으러 걸어가는 길). 내려놓기는 바닥 전체에서 된다.
 */
export function atticSlotArea(unit) {
  const floor = atticFloorBounds(unit);
  const width = 352, height = 768; // 돌린 카드 4줄(x) × 6칸(z)
  return { x: Math.round((-3.7 - ATTIC_FLOOR.minX) / unit), y: Math.round((floor.height - height) / 2), width, height };
}

/** 저장소 레이아웃에 넘기는 자리별 정원. 넘치면 바닥에 깔린다. */
export const ATTIC_HOME_CAPACITY = Object.freeze({
  pinboard: ATTIC_PINBOARD.cols * ATTIC_PINBOARD.rows,
  books: ATTIC_BOOKS.stacks.length * ATTIC_BOOKS.perStack,
});

/** 상자 칸 크기: `models/box.glb`(0.514 × 0.493 × 0.682 m, 앞 = 짧은 면) ×2 */
export const ATTIC_BOX = Object.freeze({ width: 1.03, depth: 1.36, height: 0.98 });

/**
 * 핀보드 i번째 칸의 자세. 위 줄부터 왼쪽→오른쪽(방에서 볼 때). 칸 안에서 조금씩 틀어 손으로 꽂은 것처럼.
 * 카드는 앞면이 −z(방 쪽)를 보도록 세운다: facePitch +90°, spin 180°.
 */
export function pinboardPose(index) {
  const p = ATTIC_PINBOARD;
  const col = index % p.cols, row = Math.floor(index / p.cols) % p.rows;
  const cellW = (p.maxX - p.minX) / p.cols, cellH = (p.maxY - p.minY) / p.rows;
  const jitter = (n) => ((Math.sin((index + 1) * n) * 43758.5453) % 1);
  // 방에서 보면 오른쪽이 −x. 첫 칸이 왼쪽 위에 오도록 x를 뒤집는다.
  const x = p.maxX - cellW * (col + 0.5) + jitter(12.9) * 0.05;
  const y = p.maxY - cellH * (row + 0.5) + jitter(78.2) * 0.04;
  return { x, y, z: p.z, spin: Math.PI + jitter(3.7) * 0.09, facePitch: Math.PI / 2, scale: p.scale };
}

/** 책 더미 칸 → (더미 번호, 몇 번째 층). 한 더미를 채운 뒤 옆 더미로: 몇 권이어도 쌓여 보이게. */
export function bookSlot(index) {
  const { stacks, perStack } = ATTIC_BOOKS;
  return { stack: Math.floor(index / perStack) % stacks.length, level: index % perStack };
}
