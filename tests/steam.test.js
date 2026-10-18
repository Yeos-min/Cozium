import test from "node:test";
import assert from "node:assert/strict";
import { puffPose, STEAM } from "../js/three/steam-path.js";

test("김 덩이: 입구에서 투명하게 나와 올라가며 커지고 사라진다", () => {
  const start = puffPose(0, 0), mid = puffPose(0, STEAM.period * 0.5), end = puffPose(0, STEAM.period * 0.999);
  assert.equal(start.y, 0);
  assert.ok(start.opacity < 1e-6 && end.opacity < 0.01, "처음과 끝은 보이지 않는다");
  assert.ok(mid.opacity > STEAM.opacity * 0.9, "가운데서 가장 진하다");
  assert.ok(mid.y > start.y && end.y > mid.y && end.y <= STEAM.rise, "계속 올라가고 rise를 넘지 않는다");
  assert.ok(end.scale > mid.scale && mid.scale > start.scale, "올라가며 퍼진다");
});

test("김 덩이들은 위상이 어긋나 있어 늘 몇 개는 보인다", () => {
  for (const t of [0, 0.7, 1.9, 2.6]) {
    const visible = Array.from({ length: STEAM.puffs }, (_, i) => puffPose(i, t)).filter((p) => p.opacity > 0.1).length;
    assert.ok(visible >= 2, `t=${t}: ${visible}개`);
  }
});
