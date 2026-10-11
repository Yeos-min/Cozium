import { overlaps } from "./box-placement.js";

/**
 * 장애물 윗면 높이. 높이가 없는 장애물(가구)은 무한히 높다.
 * 그 위에 서면 머리가 경사 천장에 닿는 자리라면(ceilingAt·headroom) 오를 수 없으니 역시 무한히 높다.
 */
function obstacleTop(obstacle, context) {
  if (!Number.isFinite(obstacle.height)) return Infinity;
  const top = (obstacle.y ?? 0) + obstacle.height;
  if (context.ceilingAt && top + (context.headroom ?? 0) > context.ceilingAt(obstacle.x)) return Infinity;
  return top;
}

/**
 * context.feet(발 높이, 기본 0)보다 step 이상 높은 장애물만 막는다(점프 중이거나 상자 위에 서 있으면 넘어간다).
 */
export function walkBlocked(point, context) {
  const { obstacles = [], radius, bounds } = context;
  const feet = context.feet ?? 0, step = context.step ?? 0.05;
  return point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ ||
    obstacles.some(obstacle => obstacleTop(obstacle, context) > feet + step &&
      overlaps({ ...point, width: radius * 2, depth: radius * 2 }, obstacle, 0.02));
}

/**
 * 발밑 높이: 몸 가운데 둘레(반지름의 절반)가 걸친 장애물 중 발 높이 + step 이하인 가장 높은 윗면. 없으면 바닥 0.
 */
export function groundAt(point, context) {
  const { obstacles = [], radius } = context;
  const feet = context.feet ?? 0, step = context.step ?? 0.05;
  let ground = 0;
  for (const obstacle of obstacles) {
    const top = obstacleTop(obstacle, context);
    if (!Number.isFinite(top) || top > feet + step || top <= ground) continue;
    if (overlaps({ ...point, width: radius, depth: radius }, obstacle, 0)) ground = top;
  }
  return ground;
}

/**
 * 한 프레임의 위아래 움직임. 중력으로 떨어지다 발밑(ground)에 닿으면 선다. 천장(maxFeet)에 머리가 닿으면 멈춘다.
 * @returns {{ y: number, vy: number, grounded: boolean }}
 */
export function stepVertical({ y, vy }, { dt, ground, gravity, maxFeet = Infinity }) {
  vy -= gravity * dt;
  y += vy * dt;
  if (y > maxFeet) { y = Math.max(ground, maxFeet); vy = Math.min(0, vy); }
  if (y <= ground) return { y: ground, vy: 0, grounded: true };
  return { y, vy, grounded: false };
}

/** 배치 변경/스폰으로 가구 안에 들어간 경우 가장 가까운 빈 보행 위치를 찾는다. */
export function safeWalkPosition(point, context) {
  if (!walkBlocked(point, context)) return { ...point };
  const { bounds } = context;
  let best = null, distance = Infinity;
  const step = 0.2;
  for (let x = bounds.minX; x <= bounds.maxX; x += step) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
      const d = (x - point.x) ** 2 + (z - point.z) ** 2;
      if (d >= distance || walkBlocked({ x, z }, context)) continue;
      best = { x, z }; distance = d;
    }
  }
  return best;
}

export function moveWalker(point, delta, context) {
  const safe = safeWalkPosition(point, context);
  if (!safe) return { ...point };
  const result = { ...safe };
  // 낮은 프레임 속도/달리기에서도 얇은 장애물을 건너뛰지 않는다.
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / Math.min(0.2, context.radius / 2)));
  for (let i = 0; i < steps; i++) {
    const x = result.x + delta.x / steps;
    if (!walkBlocked({ x, z: result.z }, context)) result.x = x;
    const z = result.z + delta.z / steps;
    if (!walkBlocked({ x: result.x, z }, context)) result.z = z;
  }
  return result;
}

/** 한글 입력 상태에서도 물리적인 WASD 키로 이동한다. */
export function movementKey(event) {
  const code = event.code ?? "";
  if (/^Key[WASD]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Shift(Left|Right)$/.test(code)) return "shift";
  if (code === "Space") return "space";
  return event.key.toLowerCase();
}
