import assert from "node:assert/strict";
import test from "node:test";

import { MemoryProvider } from "../js/providers/memory-provider.js";
import { applyPlan, buildPlan, checkPlan, parsePlan, planGroups, splitPlan, undoApplied } from "../js/state/cleanup-plan.js";

/** NativeHelperProvider와 같은 모양의 가짜 Helper. 바탕화면 바로 위 파일과 폴더 트리만 안다. */
function fakeHelper({ files, folders }) {
  let seq = 0;
  const state = { files: files.map((f, i) => ({ id: `f${i}`, size: 0, ...f })), folders: folders.map((f, i) => ({ id: `d${i}`, parentId: null, ...f })), moves: [], mkdirs: [] };
  return {
    state,
    async scan() { return { files: this.files, folders: this.folders }; },
    get files() { return state.files.filter((f) => !f.in); },
    get folders() { return state.folders.filter((f) => f.listed !== false); },
    async listSubfolders(id) { for (const f of state.folders) if (f.parentId === id) f.listed = true; return state.folders.filter((f) => f.parentId === id); },
    async createFolder(parentId, name) { const folder = { id: `n${seq++}`, parentId, name }; state.folders.push(folder); state.mkdirs.push(name); return folder; },
    async moveBatch(ids, folderId) {
      const batchId = `b${seq++}`;
      const moved = [], failed = [];
      for (const id of ids) {
        const file = state.files.find((f) => f.id === id);
        if (file.clash) failed.push({ fileId: id, fileName: file.name, message: "이미 같은 이름이 있습니다" });
        else { file.in = folderId; moved.push({ fileId: id, fileName: file.name }); }
      }
      state.moves.push({ batchId, ids, folderId });
      return { batchId, moved, failed };
    },
    async undoBatch(batchId) {
      const batch = state.moves.find((m) => m.batchId === batchId);
      for (const id of batch.ids) delete state.files.find((f) => f.id === id).in;
      return { restored: batch.ids.map((fileId) => ({ fileId })), failed: [] };
    },
  };
}

test("체험 이동이 계획이 된다: 바탕화면 → 폴더, 새 폴더 경로, 안 옮긴 파일은 없음", async () => {
  const provider = new MemoryProvider({ delay: false, folders: [{ name: "과제" }] });
  await provider.scan();
  const [a, b] = provider.files;
  const folder = provider.folders[0];
  await provider.moveBatch([a.id], folder.id);
  const made = await provider.createFolder(null, "사진");
  await provider.moveBatch([b.id], made.id);
  const plan = buildPlan({ moves: provider.moves, now: new Date("2026-10-18T03:00:00Z") });
  assert.equal(plan.moves.length, 2);
  assert.deepEqual(plan.moves.map((m) => [m.name, m.from, m.to]), [[a.name, [], ["과제"]], [b.name, [], ["사진"]]]);
  assert.deepEqual(parsePlan(JSON.stringify(plan)).moves, plan.moves);
  assert.equal(planGroups(plan).length, 2);
});

test("되돌린 이동은 계획에서 빠진다", async () => {
  const provider = new MemoryProvider({ delay: false, folders: [{ name: "과제" }] });
  await provider.scan();
  const [a] = provider.files;
  const result = await provider.moveBatch([a.id], provider.folders[0].id);
  await provider.undoBatch(result.batchId);
  assert.equal(provider.moves.length, 0);
});

test("계획 파일 검사: 다른 파일·깨진 목록은 거부", () => {
  assert.throws(() => parsePlan("{"), /읽지 못했어요/);
  assert.throws(() => parsePlan({ kind: "x" }), /아니에요/);
  assert.throws(() => parsePlan({ kind: "cozium-cleanup-plan", version: 1, moves: [{ name: "a", from: [], to: [""] }] }), /깨져/);
});

test("Helper로 적용: 있는 폴더·하위 폴더·새 폴더, 없는 파일·크기 다름·충돌은 그 항목만 실패", async () => {
  const helper = fakeHelper({
    files: [{ name: "보고서.hwp", size: 10 }, { name: "Photo.PNG", size: 5 }, { name: "바뀜.txt", size: 3 }, { name: "충돌.pdf", size: 1, clash: true }],
    folders: [{ name: "과제" }, { name: "3D", parentId: "d0", listed: false }],
  });
  const plan = buildPlan({ moves: [
    { name: "보고서.hwp", size: 10, from: [], to: ["과제", "3D"] },
    { name: "photo.png", size: 5, from: [], to: ["사진", "2026"] },
    { name: "바뀜.txt", size: 99, from: [], to: ["과제"] },
    { name: "없음.zip", size: 1, from: [], to: ["과제"] },
    { name: "충돌.pdf", size: 1, from: [], to: ["과제"] },
    { name: "꺼냄.txt", size: 1, from: ["과제"], to: [] },
  ] });
  assert.equal(splitPlan(plan).manual.length, 1);
  const report = await applyPlan(plan, helper);
  assert.deepEqual(report.moved.map((m) => m.name).sort(), ["photo.png", "보고서.hwp"].sort());
  assert.deepEqual(report.failed.map((f) => f.name).sort(), ["바뀜.txt", "없음.zip", "충돌.pdf"].sort());
  assert.deepEqual(report.created, [["사진"], ["사진", "2026"]]);
  assert.deepEqual(helper.state.mkdirs, ["사진", "2026"]); // 있던 3D는 만들지 않았다
  assert.equal(report.manual[0].name, "꺼냄.txt");
  const back = await undoApplied(report, helper);
  assert.equal(back.restored.length, 2);
  assert.ok(helper.state.files.every((f) => !f.in));
});

test("checkPlan counts only files that sit directly in the Helper folder (10-19: files dragged from inside a subfolder)", async () => {
  const plan = buildPlan({ moves: [
    { name: "a.png", size: 10, from: [], to: ["사진"] },
    { name: "B.txt", size: 5, from: [], to: ["문서"] },
    { name: "c.pdf", size: 7, from: [], to: ["문서"] },
    { name: "d.hwp", size: 3, from: ["과제"], to: ["문서"] },
  ] });
  const files = [{ id: "1", name: "a.png", size: 10 }, { id: "2", name: "b.txt", size: 5 }, { id: "3", name: "c.pdf", size: 99 }];
  const { present, missing, manual } = checkPlan(plan, files);
  assert.deepEqual(present.map((m) => m.name), ["a.png", "B.txt"]);
  assert.deepEqual(missing.map((m) => m.name), ["c.pdf"]);
  assert.equal(manual.length, 1);
  assert.equal(checkPlan(plan, []).present.length, 0);
});
