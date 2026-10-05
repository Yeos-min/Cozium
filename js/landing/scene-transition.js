import { getOverheadMatrix } from "./tape-renderer.js";

export const FOCUS_DURATION = 1250;
export const ROOM_TOP = [[764, 540], [1010, 570], [940, 626], [694, 590]];
export const CLOSED_RECT = [[355, 199], [1316, 199], [1316, 693], [355, 693]];
export const ROOM_FRONT = [[694, 590], [940, 626], [940, 721], [694, 673]];
export const ROOM_RIGHT = [[940, 626], [1010, 570], [1010, 663], [940, 721]];
const clamp = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const mix = (a, b, t) => a + (b - a) * t;
const phase = (n, start, end) => {
  const t = clamp((n - start) / (end - start));
  return t * t * (3 - 2 * t);
};

// Only the box changes projection. The floor stays flat throughout the camera cut.
export function getFocusTransition(startRoom, width, height, progress) {
  const p = clamp(progress);
  const overhead = getOverheadMatrix(width, height);
  const travel = 1 - Math.pow(1 - phase(p, 0, .88), 3);
  const scale = mix(startRoom.scale, overhead.scale * 2.4, travel);
  const targetX = overhead.x + 835.5 * overhead.scale;
  const targetY = overhead.y + 446 * overhead.scale;
  const room = {
    ...startRoom, scale,
    ix: mix(startRoom.ix + 852 * startRoom.scale, targetX, travel) - 852 * scale,
    iy: mix(startRoom.iy + 581.5 * startRoom.scale, targetY, travel) - 581.5 * scale,
    iw: 1672 * scale, ih: 941 * scale,
  };
  const tilt = phase(p, .38, .94);
  const quad = ROOM_TOP.map(([x, y], index) => [
    mix(room.ix + x * scale, overhead.x + CLOSED_RECT[index][0] * overhead.scale, tilt),
    mix(room.iy + y * scale, overhead.y + CLOSED_RECT[index][1] * overhead.scale, tilt),
  ]);
  const front = [quad[3], quad[2],
    [quad[2][0] - 39 * overhead.scale * tilt, quad[2][1] + mix(95 * scale, 28 * overhead.scale, tilt)],
    [quad[3][0] + 36 * overhead.scale * tilt, quad[3][1] + mix(83 * scale, 28 * overhead.scale, tilt)],
  ];
  const rightFace = 1 - phase(p, .58, .72);
  const right = [quad[2], quad[1],
    [quad[1][0], quad[1][1] + 93 * scale * (1 - tilt)],
    rightFace === 0 ? quad[2] : front[2],
  ];
  return {
    progress: p, room, overhead, quad, front, right,
    foreground: 1 - phase(p, .06, .36),
    roomBox: 1 - phase(p, .26, .38),
    face: phase(p, .26, .38),
    floor: phase(p, .36, .60),
    shadow: phase(p, .38, .62),
    rightFace,
    handoff: phase(p, .92, 1),
    done: p === 1,
  };
}
