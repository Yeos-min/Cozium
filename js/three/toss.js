/**
 * toss.js — 손을 떠나는 카드의 포물선 (2026-10-13 사용자: "무거운 파일은 좁은 포물선, 가벼운 파일은 넓은 포물선").
 * 물리 엔진 없이 계산만 한다. 모든 기기에서 같고, 도착점은 무게와 상관없이 늘 겨눈 자리다.
 * weight 0 = 가벼움(높고 느리게, 팔랑), 1 = 무거움(낮고 빠르게, 툭). 수치는 tuning.js TUNING.card.toss.
 */

/** 한 번의 비행: 걸리는 시간(초)과 꼭대기 높이. 멀리 던질수록 조금 길고 높다. */
export function tossPlan(from, to, weight, toss) {
  const mix = (a, b) => a + (b - a) * weight;
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const reach = Math.min(1.4, Math.max(0.7, Math.sqrt(dist / 3)));
  return {
    dur: mix(toss.light.time, toss.heavy.time) * reach,
    apex: mix(toss.light.apex, toss.heavy.apex) * Math.min(1.3, Math.max(0.6, dist / 3)),
  };
}

/** u(0…1) 시점의 자세. side는 팔랑이는 방향(±1). u = 0이면 from, 1이면 to 그대로. */
export function tossPose(from, to, weight, u, plan, toss, side = 1) {
  const mix = (a, b) => a + (b - a) * weight;
  // 앞으로 가는 정도: 무거우면 고르게(곧장), 가벼우면 앞에서 빨리 가고 끝에서 천천히(둥실)
  const along = u + (1 - (1 - u) * (1 - u) - u) * (1 - weight);
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
  const sway = mix(toss.light.flutter, toss.heavy.flutter) * Math.sin(u * Math.PI * 3) * (1 - u) * side;
  const tilt = mix(toss.light.tilt, toss.heavy.tilt) * (1 - u);
  return {
    x: from.x + dx * along + (-dz / len) * sway,
    z: from.z + dz * along + (dx / len) * sway,
    y: from.y + (to.y - from.y) * u + plan.apex * 4 * u * (1 - u),
    spin: from.spin + (to.spin - from.spin) * along,
    tiltZ: tilt * Math.sin(u * Math.PI * 4) * side,
    tiltX: tilt * 0.6 * Math.cos(u * Math.PI * 3),
  };
}

/** 착지할 때 위로 튀는 속도와 눌림(크기 속도). 무거울수록 크게 튄다. */
export function tossLanding(weight, toss) {
  return { vy: toss.light.bounce + (toss.heavy.bounce - toss.light.bounce) * weight, scaleV: -weight * 1.4 };
}
