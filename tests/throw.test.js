import assert from "node:assert/strict";
import test from "node:test";
import { chargePower, sampleThrow, throwPath, throwSpeed } from "../js/three/throw.js";
import { TUNING } from "../js/three/tuning.js";

// 우클릭 던지기 (2026-10-13 21시): 시선 방향 그대로, 누른 만큼 세게, 떨어지는 자리는 궤적이 정한다.
const cfg = TUNING.card.throw;
const open = { half: { x: 50, z: 50 }, solids: [] };
const eye = { x: 0, y: 3, z: 0 };
const dir = (pitchDeg) => { const p = (pitchDeg * Math.PI) / 180; return { x: 0, y: Math.sin(p), z: -Math.cos(p) }; };
const shoot = (pitch, speed, world = open) => throwPath(eye, { x: dir(pitch).x * speed, y: dir(pitch).y * speed, z: dir(pitch).z * speed }, world, cfg);

test("누른 만큼 세다: 짧게 누르면 약하게, chargeTime이면 가득", () => {
  assert.equal(chargePower(0, cfg), 0);
  assert.equal(chargePower(cfg.chargeTime, cfg), 1);
  assert.equal(chargePower(cfg.chargeTime * 3, cfg), 1);
  assert.ok(chargePower(cfg.chargeTime / 2, cfg) > 0.5);
  assert.ok(throwSpeed(1, 0, cfg) > throwSpeed(1, 1, cfg), "같은 힘이면 무거운 파일이 느리다");
});

test("위를 보고 던지면 더 높이, 더 멀리 간다. 바닥(y = 0)에서 끝난다", () => {
  const level = shoot(0, 10), up = shoot(35, 10);
  const peak = (path) => Math.max(...path.points.map((p) => p.y));
  assert.ok(peak(up) > peak(level) + 0.5, "위로 던지면 꼭대기가 높다");
  assert.ok(-up.landing.z > -level.landing.z, "위로 던지면 멀리 간다");
  assert.ok(Math.abs(up.points.at(-1).y) < 1e-9);
  assert.ok(-shoot(20, cfg.maxSpeed).landing.z > -shoot(20, cfg.minSpeed).landing.z * 3, "센 던지기가 훨씬 멀다");
});

test("벽에 맞으면 튕겨서 방 안에 떨어지고, 경사 천장에 막힌다", () => {
  const room = { half: { x: 8.7, z: 5.8 }, ceilingAt: () => 4, solids: [] };
  const hit = shoot(10, 25, room);
  assert.ok(hit.bumps > 0);
  assert.ok(Math.abs(hit.landing.z) <= 5.8);
  assert.ok(Math.max(...hit.points.map((p) => p.y)) <= 4);
});

test("가구 위에 떨어지면 앞 바닥으로 밀려난다", () => {
  const box = { x: 0, z: -4, width: 1.4, depth: 1.0, top: 1, push: { x: 0, z: 1 } };
  const room = { half: { x: 50, z: 50 }, solids: [box] };
  // 상자 위로 떨어지게 겨눈다
  let path = null;
  for (let speed = 3; speed < 12; speed += 0.05) {
    const p = shoot(20, speed, room);
    if (p.bumps > 0) { path = p; break; }
  }
  assert.ok(path, "가구에 닿는 던지기가 있다");
  assert.equal(path.caught, null);
  assert.ok(path.landing.z > box.z + box.depth / 2, "앞(+z)에 떨어진다");
  const mid = sampleThrow(path, path.duration / 2);
  assert.equal(mid.done, false);
  assert.equal(sampleThrow(path, path.duration + 1).done, true);
});

test("상자 입구로 떨어지면 그 상자에 들어가고 궤적이 입구에서 끝난다. 옆면에 맞으면 안 들어간다", () => {
  const box = { x: 0, z: -4, width: 1.4, depth: 1.4, top: 1, catch: "F1" };
  const room = { half: { x: 50, z: 50 }, solids: [box] };
  let caught = null, side = null;
  for (let speed = 3; speed < 14; speed += 0.05) {
    const p = shoot(20, speed, room);
    if (p.caught && !caught) caught = p;
  }
  assert.ok(caught, "들어가는 세기가 있다");
  assert.equal(caught.caught, "F1");
  const end = caught.points.at(-1);
  assert.ok(Math.abs(end.y - box.top) < 1e-6 && Math.abs(end.z - box.z) < box.depth / 2 + 0.2);
  // 낮게 곧장 던지면 옆면에 맞고 튕긴다
  const low = throwPath({ x: 0, y: 0.8, z: 0 }, { x: 0, y: 2, z: -12 }, room, cfg);
  assert.equal(low.caught, null);
  assert.ok(low.bumps > 0);
});
