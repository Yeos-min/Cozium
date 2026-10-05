import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three/three.module.min.js";
import { buildCardGeometry } from "../js/three/card-object.js";
import { fileFootprint, fileForm, formStyle } from "../js/three/file-form.js";
import { stackHeights, thicknessMultiplier, thicknessOf } from "../js/three/stacking.js";
import { TUNING } from "../js/three/tuning.js";

const CARD = { width: 172, height: 104 };
const MB = 1024 * 1024;

test("new forms recognize mixed-case extensions while PDF and unknown files keep their dimensions and thickness", () => {
  assert.equal(fileForm("PNG"), "photo");
  assert.equal(fileForm("JpEg"), "photo");
  assert.equal(fileForm("TXT"), "note");
  for (const extension of ["pdf", "blend", "docx", "custom", "", undefined]) {
    assert.equal(fileForm(extension), "card");
    assert.deepEqual(fileFootprint(extension, CARD), CARD);
    assert.equal(thicknessOf(MB, extension), TUNING.card.thickness * thicknessMultiplier(MB));
  }
});

test("actual photo and memo meshes sit on the floor and match the stacking height across file sizes", () => {
  for (const extension of ["png", "TXT", "pdf"]) {
    const style = formStyle(extension);
    const size = fileFootprint(extension, { width: 1.72, height: 1.04 });
    const geometry = buildCardGeometry(THREE, size.width, size.height, TUNING.card.thickness * style.thickness, style);
    geometry.computeBoundingBox();
    if (extension === "TXT") assert.equal(size.width, size.height);
    for (const bytes of [0, 3072, 600 * MB]) {
      const thickness = thicknessOf(bytes, extension);
      const multiplier = thicknessMultiplier(bytes);
      const bottom = geometry.boundingBox.min.y * multiplier + thickness / 2;
      const top = geometry.boundingBox.max.y * multiplier + thickness / 2;
      assert.ok(Math.abs(bottom) < 1e-7, `${extension}: floats above the floor`);
      assert.ok(Math.abs(top - thickness) < 1e-7, `${extension}: stack height differs from mesh`);
    }
    geometry.dispose();
  }
});

test("folded memo has a clipped silhouette, valid UVs, and a pickable face", () => {
  const style = formStyle("txt");
  const geometry = buildCardGeometry(THREE, 1.04, 1.04, TUNING.card.thickness * style.thickness, style);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(mesh).length > 0, "memo center must remain pickable");
  ray.ray.origin.set(0.50, 1, 0.50);
  assert.equal(ray.intersectObject(mesh).length, 0, "fold must change silhouette, not just color");
  for (const value of geometry.attributes.uv.array) assert.ok(Number.isFinite(value));
  geometry.dispose(); material.dispose();
});

test("mixed paper, memo and photo stacks accumulate their actual material thicknesses", () => {
  const entries = [
    { id: "photo", x: 100, y: 100, size: 3 * MB, extension: "png" },
    { id: "note", x: 100, y: 100, size: 3072, extension: "txt" },
    { id: "pdf", x: 100, y: 100, size: MB, extension: "pdf" },
  ];
  const heights = stackHeights(entries, CARD);
  assert.equal(heights.get("photo"), 0);
  const photoTop = thicknessOf(3 * MB, "png") + TUNING.card.stackGap;
  assert.equal(heights.get("note"), photoTop);
  assert.equal(heights.get("pdf"), photoTop + thicknessOf(3072, "txt") + TUNING.card.stackGap);
});

test("memo slots can overlap while the narrower objects still rest on the floor", () => {
  const entries = [
    { id: "a", x: 0, y: 100, size: 3072, extension: "txt" },
    { id: "b", x: 120, y: 100, size: 3072, extension: "txt" },
  ];
  assert.deepEqual([...stackHeights(entries, CARD).values()], [0, 0]);
  entries[1].x = 30;
  assert.ok(stackHeights(entries, CARD).get("b") > 0, "actual overlapping notes must stack");
});
