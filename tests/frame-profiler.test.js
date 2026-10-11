import test from "node:test";
import assert from "node:assert/strict";
import { createFrameProfiler, summarizeSamples } from "../js/three/frame-profiler.js";

function fixture({ gpu = false } = {}) {
  const previousDocument = globalThis.document;
  const element = () => ({
    style: {}, children: [], textContent: "", disabled: false,
    append(...children) { this.children.push(...children); },
    addEventListener() {}, remove() {},
  });
  globalThis.document = { hidden: false, createElement: element };
  let time = 0, disjoint = false, available = false;
  const queries = [];
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => gpu ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    getParameter: () => disjoint,
    getQueryParameter: (_query, parameter) => parameter === 1 ? available : 3_000_000,
    deleteQuery(query) { query.deleted = true; },
    endQuery() {},
  };
  if (gpu) {
    gl.createQuery = () => { const query = {}; queries.push(query); return query; };
    gl.beginQuery = () => {};
  }
  const info = { autoReset: true, render: { calls: 0, triangles: 0 } };
  const kit = {
    root: { ...element(), clientWidth: 1920, clientHeight: 1080 },
    mode: "walk", renderQuality: { mode: "high", active: "high" },
    camera: { position: { x: 0, y: 3.1, z: 5 }, rotation: { x: 0, y: 0, z: 0 } },
    renderer: {
      domElement: { width: 1920, height: 1080 },
      getContext: () => gl, getPixelRatio: () => 1, info,
      render(calls, triangles) {
        assert.equal(this.info, info);
        info.render.calls = calls;
        info.render.triangles = triangles;
        time += 1;
        return "rendered";
      },
    },
    pick() { time += 2; return { kind: "card" }; },
  };
  const profiler = createFrameProfiler(kit, { now: () => time });
  return {
    kit, profiler, queries, advance(ms) { time += ms; },
    available() { available = true; }, disjoint() { disjoint = true; },
    cleanup() { profiler.dispose(); globalThis.document = previousDocument; },
  };
}

test("summary uses nearest-rank p95 and rejects missing or invalid timings", () => {
  const values = [...Array.from({ length: 19 }, (_, index) => index + 1), 100, null, NaN, Infinity, -1];
  assert.deepEqual(summarizeSamples(values), { count: 20, mean: 14.5, p95: 19, max: 100 });
  assert.deepEqual(summarizeSamples([null, NaN, -1]), { count: 0, mean: null, p95: null, max: null });
});

test("recording keeps nested picking separate and sums render submissions despite per-render resets", () => {
  const f = fixture();
  try {
    assert.equal(f.profiler.active, false);
    assert.equal(f.kit.renderer.render(90, 900), "rendered");
    f.profiler.reset();
    f.profiler.startFrame(1 / 60);
    f.profiler.measure("board", () => {
      f.advance(3);
      assert.deepEqual(f.kit.pick(), { kind: "card" });
    });
    f.profiler.measure("webgl", () => {
      f.kit.renderer.render(12, 120);
      f.kit.renderer.render(4, 40);
    });
    f.kit.camera.position.z -= 1;
    f.kit.camera.rotation.y += 0.5;
    f.profiler.endFrame();
    const result = f.profiler.finish();
    assert.equal(result.cpuMs.board.mean, 5);
    assert.equal(result.cpuMs.pick.mean, 2);
    assert.equal(result.cpuMs.webgl.mean, 2);
    assert.equal(result.render.calls.mean, 16);
    assert.equal(result.render.triangles.mean, 160);
    assert.equal(result.render.submissions.mean, 2);
    assert.equal(f.kit.renderer.info.autoReset, true);
    assert.deepEqual(result.cameraTravel, { position: 1, rotationRadians: 0.5 });
    assert.equal(result.gpuWebglMs.status, "unsupported");
    assert.equal(result.gpuWebglMs.mean, null);
    const output = f.kit.root.children[0].children[3].children[1];
    assert.equal(JSON.parse(output.textContent).samplesRecorded, 1);
  } finally { f.cleanup(); }
});

test("hidden and interrupted frames do not contaminate interval or CPU percentiles", () => {
  const f = fixture();
  try {
    f.profiler.reset();
    globalThis.document.hidden = true;
    f.profiler.startFrame(1 / 60);
    f.profiler.endFrame();
    globalThis.document.hidden = false;
    f.profiler.startFrame(0.5);
    f.profiler.measure("board", () => f.advance(200));
    f.profiler.endFrame();
    f.profiler.startFrame(NaN);
    f.profiler.endFrame();
    f.profiler.startFrame(0.020);
    f.profiler.measure("board", () => f.advance(4));
    f.profiler.endFrame();
    const result = f.profiler.finish();
    assert.deepEqual(result.excluded, { hidden: 1, longInterval: 1, invalidInterval: 1 });
    assert.equal(result.samplesRecorded, 1);
    assert.equal(result.frameIntervalMs.mean, 20);
    assert.equal(result.averageRafFps, 50);
    assert.equal(result.cpuMs.board.mean, 4);
  } finally { f.cleanup(); }
});

test("GPU results are read only when available, and disjoint queries are discarded", () => {
  for (const disjoint of [false, true]) {
    const f = fixture({ gpu: true });
    try {
      f.profiler.reset();
      f.profiler.startFrame(1 / 60);
      f.profiler.measure("webgl", () => f.kit.renderer.render(2, 20));
      f.profiler.endFrame();
      assert.equal(f.queries[0].deleted, undefined);
      if (disjoint) f.disjoint();
      else f.available();
      const result = f.profiler.finish();
      assert.equal(f.queries[0].deleted, true);
      assert.equal(result.gpuWebglMs.status, disjoint ? "disjoint" : "available");
      assert.equal(result.gpuWebglMs.mean, disjoint ? null : 3);
    } finally { f.cleanup(); }
  }
});


test("a disjoint run invalidates GPU samples already read and stops further queries until reset", () => {
  const f = fixture({ gpu: true });
  try {
    f.profiler.reset();
    f.profiler.startFrame(1 / 60);
    f.profiler.measure("webgl", () => f.kit.renderer.render(2, 20));
    f.profiler.endFrame();
    f.available();
    f.profiler.startFrame(1 / 60);
    f.profiler.measure("webgl", () => f.kit.renderer.render(2, 20));
    f.profiler.endFrame();
    f.disjoint();
    f.profiler.startFrame(1 / 60);
    f.profiler.measure("webgl", () => f.kit.renderer.render(2, 20));
    f.profiler.endFrame();
    assert.equal(f.queries.length, 2);
    const result = f.profiler.finish();
    assert.equal(result.gpuWebglMs.status, "disjoint");
    assert.equal(result.gpuWebglMs.count, 0);
    assert.ok(result.samples.every(frame => frame.gpuMs === null));
  } finally { f.cleanup(); }
});

test("the ten-second window closes before capturing another frame", () => {
  const f = fixture();
  try {
    f.profiler.reset();
    f.profiler.startFrame(1 / 60);
    f.profiler.endFrame();
    f.advance(10_000);
    f.profiler.startFrame(1 / 60);
    f.profiler.endFrame();
    assert.equal(f.profiler.active, false);
    assert.equal(f.profiler.result.stopReason, "duration");
    assert.equal(f.profiler.result.samplesRecorded, 1);
    assert.equal(f.profiler.result.durationMs, 10_000);
    f.advance(2000);
    assert.equal(f.profiler.finish().durationMs, 10_000);
  } finally { f.cleanup(); }
});


test("pointer-event picking outside frames is recorded separately from board and frame picking", () => {
  const f = fixture();
  try {
    f.kit.pick(); // Inactive calls must not enter the event sample.
    f.profiler.reset();
    f.kit.pick();
    f.profiler.startFrame(1 / 60);
    f.profiler.measure("board", () => f.kit.pick());
    f.profiler.endFrame();
    f.kit.pick();
    const result = f.profiler.finish();
    assert.equal(result.events.pickEvents, 2);
    assert.deepEqual(result.events.pickCpuMs, { count: 2, mean: 2, p95: 2, max: 2 });
    assert.equal(result.events.excludedByLimit, 0);
    assert.equal(result.cpuMs.pick.count, 1);
    assert.equal(result.cpuMs.pick.mean, 2);
    assert.equal(result.cpuMs.board.mean, 2);
  } finally { f.cleanup(); }
});

