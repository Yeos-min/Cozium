import test from "node:test";
import assert from "node:assert/strict";
import { RenderQuality, RENDER_PROFILES, deviceTier, renderPixelRatio, qualityMode } from "../js/three/render-quality.js";

const run = (quality, fps, seconds, visible = true) => {
  let changes = 0;
  for (let i = 0; i < Math.round(fps * seconds); i += 1) changes += Number(quality.observe(1 / fps, visible));
  return changes;
};

test("pixel budgets bound high-DPI and wide displays without enlarging a low-DPI buffer", () => {
  for (const profile of Object.values(RENDER_PROFILES)) {
    for (const [width, height, dpr] of [[1920, 1080, 2], [3840, 2160, 2], [7680, 4320, 3], [390, 844, 1]]) {
      const ratio = renderPixelRatio(width, height, dpr, profile);
      assert.ok(ratio <= dpr && ratio <= profile.maxDpr);
      assert.ok(Math.floor(width * ratio) * Math.floor(height * ratio) <= profile.maxPixels);
    }
  }
  assert.equal(renderPixelRatio(390, 844, 1, RENDER_PROFILES.high), 1);
  assert.equal(renderPixelRatio(100, 100, NaN, RENDER_PROFILES.high), 1);
  assert.equal(renderPixelRatio(390, 844, 1, RENDER_PROFILES.high, 0.75), 0.75, "the auto scale lowers the resolution");
});

test("the starting tier comes from the GPU: software GL is low, integrated balanced, discrete high", () => {
  assert.equal(deviceTier({ renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)" }), "low");
  assert.equal(deviceTier({ renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)", cores: 8 }), "balanced");
  assert.equal(deviceTier({ renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)", cores: 12, memory: 8 }), "high");
  assert.equal(deviceTier({ renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050)", cores: 4 }), "balanced", "a 4-core machine is capped");
  assert.equal(deviceTier({ renderer: "", cores: 2 }), "low");
  assert.equal(deviceTier(), "balanced");
  assert.equal(new RenderQuality("auto", { tier: "high" }).active, "high");
  assert.equal(new RenderQuality("auto", { tier: "nonsense" }).active, "balanced");
});

test("auto first lowers the resolution, then drops a tier, and never upgrades the tier", () => {
  const quality = new RenderQuality();
  assert.equal(quality.active, "balanced");
  assert.equal(run(quality, 60, 6), 0);
  assert.equal(quality.scale, 1);
  assert.ok(run(quality, 30, 1.6) >= 1);
  assert.equal(quality.active, "balanced");
  assert.equal(quality.scale, 0.875, "first the resolution");
  run(quality, 30, 6);
  assert.equal(quality.active, "low", "then the profile, once the resolution is at its floor");
  assert.equal(quality.profile.effects, false);
  assert.equal(quality.profile.rays, false);
  run(quality, 60, 120);
  assert.equal(quality.active, "low");
});

test("a recovered frame rate wins the resolution back slowly, a little longer after every slowdown", () => {
  const quality = new RenderQuality("auto", { tier: "high" });
  run(quality, 30, 1.6);
  assert.equal(quality.scale, 0.875);
  run(quality, 60, 1.5 * 5);
  assert.equal(quality.scale, 0.875, "not yet: after a slowdown it waits 6 windows");
  run(quality, 60, 1.5 * 2);
  assert.equal(quality.scale, 1);
  run(quality, 30, 1.6);
  run(quality, 60, 1.5 * 11);
  assert.equal(quality.scale, 0.875, "the second time it waits 12 windows");
  run(quality, 60, 1.5 * 2);
  assert.equal(quality.scale, 1);
  assert.equal(quality.active, "high");
});

test("one slow frame and background suspension change nothing", () => {
  const quality = new RenderQuality();
  quality.observe(0.12);
  run(quality, 60, 3);
  assert.equal(quality.scale, 1);
  run(quality, 30, 0.8);
  quality.observe(1 / 30, false);
  for (const dt of [3, NaN, Infinity, -1, 0]) quality.observe(dt);
  run(quality, 30, 0.8);
  assert.equal(quality.active, "balanced");
  assert.equal(quality.scale, 1);
});

test("manual selection is respected and switching to auto starts a fresh measurement", () => {
  const quality = new RenderQuality("high");
  assert.equal(run(quality, 15, 20), 0);
  assert.equal(quality.active, "high");
  quality.set("low");
  assert.equal(quality.active, "low");
  quality.set("auto");
  assert.equal(quality.active, "balanced");
  run(quality, 30, 1);
  assert.equal(quality.active, "balanced");
  assert.equal(qualityMode("unexpected"), "auto");
  quality.setStartTier("high");
  assert.equal(quality.active, "high");
});
