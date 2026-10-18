/** steam-path.js — 머그잔 김 덩이의 움직임(순수 계산, three 없음). 그리는 쪽은 steam.js. */

export const STEAM = {
  puffs: 5,        // 동시에 떠 있는 김 덩이
  period: 3.2,     // 한 덩이가 올라가 사라지기까지(초)
  rise: 1.6,       // 올라가는 높이(머그 너비의 배수). 책상 위는 처마 경사가 낮아 높이 올리면 지붕에 묻힌다
  size: 0.55,       // 처음 크기(머그 너비의 배수), 끝에서는 약 2.2배
  sway: 0.18,      // 좌우 흔들림(머그 너비의 배수)
  opacity: 0.5,
  color: "#fffaf2",
};

/** 고정된 시드처럼 보이는 위상: 덩이마다 흔들리는 방향과 회전이 다르다. */
const PHASE = [0, 2.1, 4.4, 1.3, 3.6, 5.2, 0.7, 2.9];

/** 순수 계산: 덩이 i의 시각 t 자세. 테스트에서도 쓴다. p = 0(입구) … 1(사라짐). */
export function puffPose(i, t, opts = STEAM) {
  const p = (((t / opts.period) + i / opts.puffs) % 1 + 1) % 1;
  const k = PHASE[i % PHASE.length];
  return {
    p,
    y: opts.rise * (1 - (1 - p) * (1 - p)), // 처음엔 빠르게, 위에서 느려진다
    x: opts.sway * Math.sin(t * 0.9 + k) * p,
    z: opts.sway * 0.6 * Math.cos(t * 0.7 + k * 1.3) * p,
    scale: opts.size * (1 + 1.2 * p),
    opacity: opts.opacity * Math.pow(Math.sin(Math.PI * p), 1.4),
    rotation: k + p * 0.9 * (i % 2 ? 1 : -1),
  };
}
