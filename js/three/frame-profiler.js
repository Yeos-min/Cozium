/** Opt-in game timing. CPU durations measure JS/submission, not GPU completion. */
export function summarizeSamples(values) {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, mean: null, p95: null, max: null };
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}

const CPU_STAGES = ["camera", "board", "webgl", "labels", "pick"];
const pose = camera => ({
  position: [camera.position.x, camera.position.y, camera.position.z],
  rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
});
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

export function createFrameProfiler(kit, { now = () => performance.now(), durationMs = 10_000, maxSamples = 1800 } = {}) {
  const renderer = kit.renderer;
  const gl = renderer.getContext();
  const ext = typeof gl.createQuery === "function" ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;
  let gpuStatus = ext ? "available" : "unsupported";
  let active = false, current = null, startedAt = 0, endedAt = 0, timer = null, pollTimer = null, result = null;
  let samples = [], pending = [], excluded = {}, initial = null, finalSnapshot = null, previousPose = null, travel = null;
  let externalPickMs = [], externalPickEvents = 0;
  const originalRender = renderer.render;
  const originalPick = kit.pick;
  const toolbar = document.createElement("div");
  toolbar.id = "game-performance-tools";
  toolbar.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:1000;max-width:min(440px,85vw);padding:8px;background:#fff8e6ed;color:#254c43;border:1px solid #b8b09d;border-radius:6px;font:12px sans-serif";
  const measureButton = document.createElement("button");
  measureButton.textContent = "10초 측정";
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "JSON 저장";
  downloadButton.disabled = true;
  const status = document.createElement("span");
  status.style.marginLeft = "8px";
  status.textContent = "게임 프레임 측정";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "측정 JSON";
  const output = document.createElement("pre");
  output.id = "game-performance-result";
  output.style.cssText = "max-height:180px;overflow:auto;font-size:10px;white-space:pre";
  details.append(summary, output);
  toolbar.append(measureButton, downloadButton, status, details);
  for (const name of ["pointerdown", "pointerup", "pointermove", "contextmenu", "click", "keydown"]) {
    toolbar.addEventListener(name, event => event.stopPropagation());
  }
  kit.root.append(toolbar);

  function snapshot() {
    const store = typeof window !== "undefined" ? window.__app?.store : null;
    const files = store?.files ?? [];
    return {
      camera: { mode: kit.mode, ...pose(kit.camera) },
      quality: { mode: kit.renderQuality.mode, active: kit.renderQuality.active },
      effects: {
        outlineThickness: kit.outlineEffect?.outline?.thickness ?? null,
        dithering: kit.outlineEffect?.dithering?.preset ?? null,
        vertexWobble: kit.vertexSnap?.settings?.preset ?? null,
        shadowSize: kit.keyLight?.shadow?.mapSize ? { width: kit.keyLight.shadow.mapSize.x, height: kit.keyLight.shadow.mapSize.y } : null,
      },
      pointerLocked: document.pointerLockElement === renderer.domElement,
      moveInput: kit.moveInput ? { ...kit.moveInput } : null,
      viewport: { width: kit.root.clientWidth, height: kit.root.clientHeight },
      buffer: { width: renderer.domElement.width, height: renderer.domElement.height, pixelRatio: renderer.getPixelRatio() },
      sample: store ? {
        provider: window.__app.provider?.constructor?.name,
        files: files.length, selected: store.selection.length,
        placed: files.filter(entry => entry.status === "placed").length,
        moving: files.filter(entry => entry.status === "moving").length,
        queued: files.filter(entry => entry.status === "queued").length,
      } : null,
    };
  }

  function releaseQueries() {
    for (const item of pending) gl.deleteQuery(item.query);
    pending = [];
  }

  function pollGpu(force = false) {
    if (!ext || (!pending.length && !force)) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      gpuStatus = "disjoint";
      for (const frame of samples) frame.gpuMs = null;
      if (current) current.gpuMs = null;
      releaseQueries();
      return;
    }
    pending = pending.filter(item => {
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      const ns = gl.getQueryParameter(item.query, gl.QUERY_RESULT);
      item.frame.gpuMs = Number.isFinite(ns) && ns >= 0 ? ns / 1e6 : null;
      gl.deleteQuery(item.query);
      return false;
    });
  }

  function publish() {
    const interval = summarizeSamples(samples.map(frame => frame.intervalMs));
    result = {
      schema: 1, measuredAt: new Date().toISOString(), source: "Cozium Three.js game",
      durationMs: Math.max(0, endedAt - startedAt), stopReason: result?.stopReason ?? "manual",
      samplesRecorded: samples.length, maxSamples, excluded: { ...excluded },
      frameIntervalMs: interval, averageRafFps: interval.mean > 0 ? 1000 / interval.mean : null,
      cpuMs: Object.fromEntries(CPU_STAGES.map(name => [name, summarizeSamples(samples.map(frame => frame.cpuMs[name]))])),
      gpuWebglMs: { status: gpuStatus, pending: pending.length, ...summarizeSamples(samples.map(frame => frame.gpuMs)) },
      events: {
        pickCpuMs: summarizeSamples(externalPickMs), pickEvents: externalPickEvents,
        excludedByLimit: Math.max(0, externalPickEvents - externalPickMs.length), samplesMs: externalPickMs,
      },
      render: {
        calls: summarizeSamples(samples.map(frame => frame.drawCalls)),
        triangles: summarizeSamples(samples.map(frame => frame.triangles)),
        submissions: summarizeSamples(samples.map(frame => frame.submissions)),
      },
      environment: { userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null },
      start: initial, end: finalSnapshot, cameraTravel: { ...travel }, samples,
      notes: [
        "CPU ms are JavaScript and WebGL submission time; they are not GPU completion time.",
        "board CPU includes nested pick CPU. Do not add pick to board.",
        "events.pickCpuMs measures SceneKit.pick calls outside frame callbacks; it excludes caller target construction and store updates.",
        "Filter target sizes can remain allocated while the filter strength is zero; preset/strength describe whether it runs.",
        "RAF intervals include scheduling and display cadence; averageRafFps is not a GPU throughput benchmark.",
        "GPU ms cover the webgl stage only and are null when unsupported, unavailable or disjoint.",
        "A disjoint result invalidates all GPU samples in this run; capture resumes only on the next measurement.",
        "Hidden frames, invalid intervals and intervals above 250 ms are excluded.",
      ],
    };
    output.textContent = JSON.stringify(result, null, 2);
    downloadButton.disabled = false;
    status.textContent = `완료 · ${samples.length}프레임`;
  }

  function finish(reason = "manual") {
    if (!active) return result;
    active = false;
    current = null;
    endedAt = now();
    finalSnapshot = snapshot();
    clearTimeout(timer);
    result = { stopReason: reason };
    pollGpu(true);
    publish();
    // Query availability is checked later; never block with finish()/readPixels().
    const deadline = now() + 2000;
    const drain = () => {
      pollGpu();
      if (!pending.length || now() >= deadline) {
        releaseQueries();
        publish();
        return;
      }
      pollTimer = setTimeout(drain, 50);
    };
    if (pending.length) pollTimer = setTimeout(drain, 50);
    return result;
  }

  function reset() {
    clearTimeout(timer);
    clearTimeout(pollTimer);
    releaseQueries();
    active = true;
    current = null;
    result = null;
    samples = [];
    externalPickMs = [];
    externalPickEvents = 0;
    measureButton.blur?.();
    excluded = { hidden: 0, longInterval: 0, invalidInterval: 0 };
    startedAt = now();
    gpuStatus = ext ? "available" : "unsupported";
    initial = snapshot();
    previousPose = initial.camera;
    travel = { position: 0, rotationRadians: 0 };
    output.textContent = "";
    status.textContent = "측정 중 · WASD / 시점 / 집기 / 넣기";
    downloadButton.disabled = true;
    timer = setTimeout(() => finish("duration"), durationMs);
  }

  function startFrame(elapsed) {
    pollGpu();
    current = null;
    if (!active) return;
    if (now() - startedAt >= durationMs) { finish("duration"); return; }
    if (document.hidden) { excluded.hidden += 1; return; }
    if (!Number.isFinite(elapsed) || elapsed <= 0) { excluded.invalidInterval += 1; return; }
    if (elapsed > 0.25) { excluded.longInterval += 1; return; }
    current = {
      intervalMs: elapsed * 1000, cpuMs: Object.fromEntries(CPU_STAGES.map(name => [name, 0])),
      gpuMs: null, drawCalls: 0, triangles: 0, submissions: 0,
      quality: kit.renderQuality.active,
    };
  }

  function measure(name, callback) {
    if (!current) return callback();
    const frame = current;
    const started = now();
    let query = null;
    if (name === "webgl" && ext && gpuStatus === "available" && pending.length < 16) {
      query = gl.createQuery();
      if (query) {
        try { gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
        catch { gl.deleteQuery(query); query = null; gpuStatus = "error"; }
      }
    }
    try { return callback(); }
    finally {
      frame.cpuMs[name] = (frame.cpuMs[name] ?? 0) + now() - started;
      if (query) {
        try {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push({ query, frame });
        } catch { gl.deleteQuery(query); gpuStatus = "error"; }
      }
    }
  }

  function endFrame() {
    if (!current) return;
    const nextPose = pose(kit.camera);
    travel.position += distance(previousPose.position, nextPose.position);
    travel.rotationRadians += distance(previousPose.rotation, nextPose.rotation);
    previousPose = nextPose;
    samples.push(current);
    current = null;
    if (samples.length >= maxSamples) finish("sample-limit");
  }

  function wrappedRender(...args) {
    if (!current) return originalRender.apply(this, args);
    const value = originalRender.apply(this, args);
    // info.autoReset remains unchanged; default Three.js resets at each render.
    current.drawCalls += renderer.info.render.calls;
    current.triangles += renderer.info.render.triangles;
    current.submissions += 1;
    return value;
  }
  function wrappedPick(...args) {
    if (!active || current || document.hidden) return measure("pick", () => originalPick.apply(this, args));
    const started = now();
    try { return originalPick.apply(this, args); }
    finally {
      externalPickEvents += 1;
      if (externalPickMs.length < maxSamples) externalPickMs.push(now() - started);
    }
  }
  renderer.render = wrappedRender;
  kit.pick = wrappedPick;
  measureButton.addEventListener("click", reset);
  downloadButton.addEventListener("click", () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([output.textContent], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cozium-game-performance.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return {
    get active() { return active; },
    get result() { return result; },
    startFrame, measure, endFrame, reset, finish,
    dispose() {
      active = false;
      current = null;
      clearTimeout(timer);
      clearTimeout(pollTimer);
      releaseQueries();
      if (renderer.render === wrappedRender) renderer.render = originalRender;
      if (kit.pick === wrappedPick) kit.pick = originalPick;
      toolbar.remove();
    },
  };
}





