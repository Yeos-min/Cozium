import assert from "node:assert/strict";
import test from "node:test";
import { tossLanding, tossPlan, tossPose } from "../js/three/toss.js";
import { TUNING } from "../js/three/tuning.js";

// 손을 떠난 카드의 포물선 (2026-10-13). 도착점은 무게와 상관없이 겨눈 자리, 가벼울수록 높고 느리게.
const toss = TUNING.card.toss;
const from = { x: 0, y: 1.6, z: 0, spin: 0 };
const to = { x: 3, y: 0, z: 0, spin: 0.4 };

test("a toss starts in the hand and lands exactly on the aimed spot, heavy or light", () => {
  for (const weight of [0, 0.5, 1]) {
    const plan = tossPlan(from, to, weight, toss);
    const start = tossPose(from, to, weight, 0, plan, toss);
    const end = tossPose(from, to, weight, 1, plan, toss);
    for (const k of ["x", "y", "z"]) assert.ok(Math.abs(start[k] - from[k]) < 1e-9, `start ${k} @${weight}`);
    for (const k of ["x", "y", "z", "spin"]) assert.ok(Math.abs(end[k] - to[k]) < 1e-9, `end ${k} @${weight}`);
  }
});

test("light files fly higher and slower, heavy files lower and quicker, and heavy ones bounce more", () => {
  const light = tossPlan(from, to, 0, toss), heavy = tossPlan(from, to, 1, toss);
  assert.ok(light.apex > heavy.apex * 2, "light arc is clearly higher");
  assert.ok(light.dur > heavy.dur * 1.3, "light flight is clearly longer");
  const peak = (w, plan) => Math.max(...Array.from({ length: 41 }, (_, i) => tossPose(from, to, w, i / 40, plan, toss).y));
  assert.ok(peak(0, light) > peak(1, heavy));
  assert.ok(tossLanding(1, toss).vy > tossLanding(0, toss).vy);
});

test("no tissue-paper flutter: nothing sways sideways (10-13 21시 사용자)", () => {
  for (const weight of [0, 1]) {
    const plan = tossPlan(from, to, weight, toss);
    const maxSide = Math.max(...Array.from({ length: 41 }, (_, i) => Math.abs(tossPose(from, to, weight, i / 40, plan, toss).z)));
    assert.equal(maxSide, 0);
  }
});
