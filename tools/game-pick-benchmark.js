import { updatePickMatrices } from "../js/three/pick-matrices.js";

/** profile=1에서만 부르는 실제 장면 판정 비교. 파일/스토어 상태를 바꾸지 않는다. */
export function mountPickBenchmark(kit) {
  let targets = null;
  const originalPick = kit.pick;
  function capturePick(x, y, objects) {
    if (objects.length) targets = objects;
    return originalPick.call(this, x, y, objects);
  }
  kit.pick = capturePick;
  const button = document.createElement("button");
  button.textContent = "조준 판정 비교";
  const result = document.createElement("pre");
  result.id = "game-pick-benchmark-result";
  result.style.cssText = "max-height:160px;overflow:auto;white-space:pre;font-size:10px";
  const toolbar = document.getElementById("game-performance-tools");
  toolbar.append(button, result);

  function fullPick(x, y) {
    kit.scene.updateMatrixWorld();
    kit.raycaster.setFromCamera(kit.ndcFrom(x, y), kit.camera);
    return kit.raycaster.intersectObjects(targets, true)[0] ?? null;
  }
  function targetPick(x, y) {
    updatePickMatrices(kit.camera, targets);
    kit.raycaster.setFromCamera(kit.ndcFrom(x, y), kit.camera);
    return kit.raycaster.intersectObjects(targets, true)[0] ?? null;
  }
  button.addEventListener("click", () => {
    if (kit.profiler.active) { result.textContent = "10초 측정이 끝난 뒤 비교하세요."; return; }
    if (!targets) { result.textContent = "먼저 게임에서 카드를 겨누거나 클릭하세요."; return; }
    const rect = kit.renderer.domElement.getBoundingClientRect();
    const points = Array.from({ length: 200 }, (_, i) => [
      rect.left + ((i * 73 % 191) + 5) / 200 * rect.width,
      rect.top + ((i * 37 % 191) + 5) / 200 * rect.height,
    ]);
    let mismatches = 0, hitCount = 0;
    for (const [x, y] of points) {
      const oldHit = fullPick(x, y), newHit = targetPick(x, y);
      if (oldHit) hitCount++;
      if (oldHit?.object !== newHit?.object || Math.abs((oldHit?.distance ?? 0) - (newHit?.distance ?? 0)) > 1e-6) mismatches++;
    }
    const fullMs = [], targetMs = [];
    function run(fn) {
      const start = performance.now();
      for (const [x, y] of points) fn(x, y);
      return (performance.now() - start) / points.length;
    }
    for (let round = 0; round < 6; round++) {
      if (round % 2) { targetMs.push(run(targetPick)); fullMs.push(run(fullPick)); }
      else { fullMs.push(run(fullPick)); targetMs.push(run(targetPick)); }
    }
    let sceneObjects = 0;
    kit.scene.traverse(() => sceneObjects++);
    result.textContent = JSON.stringify({
      measuredAt: new Date().toISOString(), sceneObjects, targets: targets.length,
      queriesPerRound: points.length, rounds: fullMs.length, hitCount, mismatches,
      fullSceneMsPerQuery: fullMs, targetMatricesMsPerQuery: targetMs,
      notes: ["Static sample CPU microbenchmark; not game FPS or input-to-photon.",
        "Alternating order, warmed current geometry; store/files remain unchanged."],
    }, null, 2);
  });

  const inputButton = document.createElement("button");
  inputButton.textContent = "WASD · 시점 합성 검사";
  const inputResult = document.createElement("pre");
  inputResult.id = "game-input-check-result";
  inputResult.style.cssText = result.style.cssText;
  const params = new URLSearchParams(location.search);
  if (params.get("storage") === "memory" && params.get("entry") === "sample") {
    toolbar.append(inputButton, inputResult);
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pose = () => ({ position: kit.camera.position.toArray(), rotation: [kit.camera.rotation.x, kit.camera.rotation.y, kit.camera.rotation.z] });
  inputButton.addEventListener("click", async () => {
    const unavailable = () => kit.disposed || kit.profiler.active || window.__app.store.selection.length || window.__app.board.arranging || window.__app.board.locked || kit.mode !== "walk";
    if (unavailable()) {
      inputResult.textContent = "측정 종료 후, 1인칭 빈손 상태에서 검사하세요."; return;
    }
    inputButton.disabled = true; inputButton.blur();
    const steps = [];
    try {
      for (const key of ["w", "a", "s", "d"]) {
        const before = pose();
        window.dispatchEvent(new KeyboardEvent("keydown", { key, code: "Key" + key.toUpperCase(), bubbles: true }));
        try { await wait(200); }
        finally { window.dispatchEvent(new KeyboardEvent("keyup", { key, code: "Key" + key.toUpperCase(), bubbles: true })); }
        await wait(150);
        steps.push({ key, before, after: pose() });
        if (kit.disposed) return;
      }
      // 대기 중 사용자가 파일을 집거나 모드를 바꿨으면 우클릭을 합성하지 않는다.
      if (unavailable()) { inputResult.textContent = "상태가 바뀌어 시점 검사를 중단했습니다."; return; }
      const canvas = kit.renderer.domElement, rect = canvas.getBoundingClientRect();
      const before = pose();
      const x = rect.left + rect.width * 0.55, y = rect.top + rect.height * 0.4;
      const event = (type, cx, cy, buttons) => new PointerEvent(type, { pointerId: 901, pointerType: "mouse", button: 2, buttons, clientX: cx, clientY: cy, bubbles: true });
      canvas.dispatchEvent(event("pointerdown", x, y, 2));
      try { canvas.dispatchEvent(event("pointermove", x + 100, y - 40, 2)); }
      finally { canvas.dispatchEvent(event("pointerup", x + 100, y - 40, 0)); }
      await wait(300);
      inputResult.textContent = JSON.stringify({
        measuredAt: new Date().toISOString(), synthetic: true, steps,
        look: { before, after: pose() }, releasedMoveInput: { ...kit.moveInput },
        notes: ["Synthetic DOM events through existing game handlers; not hardware input or pointer lock.",
          "Run after the pointer-lock fallback is visible. No store/file operations are triggered."],
      }, null, 2);
    } finally { inputButton.disabled = false; }
  });
  return {
    dispose() {
      if (kit.pick === capturePick) kit.pick = originalPick;
      button.remove(); result.remove(); inputButton.remove(); inputResult.remove();
    },
  };
}