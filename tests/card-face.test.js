// 문서 카드 이름 줄바꿈: 확장자는 한 덩어리로 — 「초안.b / lend」처럼 끊기지 않게.
import test from "node:test";
import assert from "node:assert/strict";
import { wrapFileName } from "../js/three/card-face.js";
import { fileColor, familyColor } from "../js/ui/board-layout.js";

const ctx = { measureText: (text) => ({ width: [...text].length * 10 }) }; // 글자당 10px

test("확장자는 줄을 넘겨도 쪼개지지 않는다", () => {
  const lines = wrapFileName(ctx, "3D모델링_과제4_초안.blend", 140, 2);
  assert.deepEqual(lines, ["3D모델링_과제4_초안", ".blend"]);
});

test("한 줄에 들어가면 그대로", () => {
  assert.deepEqual(wrapFileName(ctx, "수업계획서.pdf", 200, 2), ["수업계획서.pdf"]);
});

test("넘치면 마지막 줄을 줄이고 확장자는 남긴다", () => {
  const lines = wrapFileName(ctx, "아주아주아주아주긴파일이름아주아주아주긴.pptx", 100, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("….pptx"), lines[1]);
  assert.ok(lines.every((line) => ctx.measureText(line).width <= 100), lines.join("|"));
});

test("자주 보는 확장자는 앱 색, 나머지는 계열 색", () => {
  assert.equal(fileColor("PDF", "document"), "#ee8a7c");
  assert.equal(fileColor("ai", "design"), "#f4a55c");
  assert.equal(fileColor("mp4", "video"), familyColor("video"));
});
