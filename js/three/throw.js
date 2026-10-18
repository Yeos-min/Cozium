/**
 * throw.js — 보는 방향으로 진짜 던지기 (2026-10-13 21시 사용자: "휴지 던지는 것 같음, 위로는 못 던지고
 * 정해진 포물선으로만 던져져서 별로"). 우클릭을 누른 만큼 세게, 시선 방향으로 던지고, 떨어지는 자리는 궤적이 정한다.
 *
 * 물리 엔진은 없다. 손을 떠나는 순간 궤적 전체를 미리 계산하고 카드는 그 길을 따라간다 — 모든 기기에서 같다.
 * 부딪히는 것: 벽(튕김), 경사 천장(머리 박고 떨어짐), 가구·상자(옆면에 튕김, 위에 떨어지면 앞으로 밀려 내려옴).
 * 상자(catch가 있는 solid)는 위로 떨어지면 들어간다(10-13 22시 사용자: 궤적 끝이 상자에 겹치면 그 상자가 빛나고, 그때
 * 던지면 그 상자로). 옆면에 맞으면 튕긴다. 가구 위에 떨어지면 앞으로 밀려 바닥으로 내려온다.
 * 숫자는 TUNING.card.throw. 단위는 게임 단위(1 = 0.5 m).
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 누른 시간(초) → 힘 0…1. 처음엔 빠르게 차고 끝에서 느려진다. */
export function chargePower(seconds, cfg) {
  const u = clamp(seconds / cfg.chargeTime, 0, 1);
  return 1 - (1 - u) * (1 - u);
}

/** 힘과 무게(0 가벼움 … 1 무거움)로 던지는 속도. 같은 힘이면 무거운 파일이 덜 날아간다. */
export function throwSpeed(power, weight, cfg) {
  const base = cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * power;
  return base * (cfg.lightFactor + (cfg.heavyFactor - cfg.lightFactor) * weight);
}

/**
 * 궤적. origin {x,y,z}, velocity {x,y,z}.
 * world: { half: {x,z} 벽까지 반폭, ceilingAt(x), solids: [{x,z,width,depth,top,push:{x,z},catch?}], radius }
 * @returns {{ points: Array<{x,y,z,t}>, landing: {x,z}, duration: number, bumps: number, caught: any }}
 *   caught = 들어간 상자의 catch 값(없으면 null). 그때 궤적은 상자 입구에서 끝난다.
 */
export function throwPath(origin, velocity, world, cfg) {
  const g = cfg.gravity, dt = cfg.step ?? 1 / 120, r = world.radius ?? 0.18;
  let x = origin.x, y = origin.y, z = origin.z, vx = velocity.x, vy = velocity.y, vz = velocity.z;
  const points = [{ x, y, z, t: 0 }];
  let t = 0, bumps = 0;
  const wall = cfg.wallBounce ?? 0.35;
  for (let i = 0; i < 2400; i++) {
    const px = x, py = y, pz = z;
    vy -= g * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    t += dt;
    // 벽
    const hx = world.half.x - r, hz = world.half.z - r;
    if (x > hx || x < -hx) { x = clamp(x, -hx, hx); vx = -vx * wall; vz *= 0.8; bumps++; }
    if (z > hz || z < -hz) { z = clamp(z, -hz, hz); vz = -vz * wall; vx *= 0.8; bumps++; }
    // 경사 천장
    const ceiling = world.ceilingAt ? world.ceilingAt(x) - 0.12 : Infinity;
    if (y > ceiling) { y = ceiling; if (vy > 0) vy = -vy * 0.15; vx *= 0.55; vz *= 0.55; bumps++; }
    // 가구·상자
    for (const s of world.solids ?? []) {
      const ex = s.width / 2 + r, ez = s.depth / 2 + r;
      if (Math.abs(x - s.x) >= ex || Math.abs(z - s.z) >= ez || y >= s.top) continue;
      if (py >= s.top - 0.02 && s.catch != null) {
        // 상자 입구로 떨어졌다: 들어간다
        const k = py > s.top ? (py - s.top) / (py - y) : 1;
        x = px + (x - px) * k; z = pz + (z - pz) * k; t = t - dt + dt * k; y = s.top;
        points.push({ x, y, z, t });
        return { points, landing: { x, z }, duration: t, bumps, caught: s.catch };
      }
      if (py >= s.top - 0.02) {
        // 위에서 떨어졌다: 윗면에 머무르지 않고 앞(push)으로 밀려 내려온다
        const push = s.push ?? nearestFace(px, pz, s);
        y = s.top;
        if (push.x) x = s.x + Math.sign(push.x) * (ex + 0.02);
        if (push.z) z = s.z + Math.sign(push.z) * (ez + 0.02);
        vx = push.x * cfg.slideOff; vz = push.z * cfg.slideOff; vy = 0;
      } else if (Math.abs(px - s.x) >= ex) {
        x = s.x + Math.sign(px - s.x) * ex; vx = -vx * wall;
      } else {
        z = s.z + Math.sign(pz - s.z) * ez; vz = -vz * wall;
      }
      bumps++;
    }
    if (y <= 0) {
      // 바닥에 닿은 순간으로 보간
      const k = py > 0 ? py / (py - y) : 1;
      x = px + (x - px) * k; z = pz + (z - pz) * k; t = t - dt + dt * k; y = 0;
      points.push({ x, y, z, t });
      break;
    }
    points.push({ x, y, z, t });
  }
  return { points, landing: { x, z }, duration: t, bumps, caught: null };
}

/** 가구 위에 떨어졌을 때 밀려날 쪽: 떨어지기 직전 자리에서 가장 가까운 옆면. */
function nearestFace(x, z, s) {
  const dx = (x - s.x) / (s.width / 2 || 1), dz = (z - s.z) / (s.depth / 2 || 1);
  return Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx) || 1, z: 0 } : { x: 0, z: Math.sign(dz) || 1 };
}

/** 시각 t의 궤적 위 자리와 속도(앞뒤 점으로). */
export function sampleThrow(path, t) {
  const p = path.points;
  if (t <= 0) return { ...p[0], vx: 0, vy: 0, vz: 0, done: false };
  let i = 1;
  while (i < p.length && p[i].t < t) i++;
  if (i >= p.length) { const e = p[p.length - 1]; return { ...e, vx: 0, vy: 0, vz: 0, done: true }; }
  const a = p[i - 1], b = p[i], span = Math.max(1e-6, b.t - a.t), k = (t - a.t) / span;
  return {
    x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
    vx: (b.x - a.x) / span, vy: (b.y - a.y) / span, vz: (b.z - a.z) / span, done: false,
  };
}
