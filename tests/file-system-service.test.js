import assert from "node:assert/strict";
import test from "node:test";

import { resolveDroppedHandles } from "../js/file-system-service.js";

test("resolveDroppedHandles keeps every valid folder in a multi-item drop", async () => {
  const folders = ["과제", "렌더", "참고자료"].map((name) => ({ kind: "directory", name }));
  const items = folders.map((handle) => ({
    kind: "file",
    getAsFileSystemHandle: async () => handle,
  }));

  const result = await resolveDroppedHandles(items);

  assert.deepEqual(result.handles, folders);
  assert.equal(result.failedCount, 0);
});

test("resolveDroppedHandles does not discard good folders when one item fails", async () => {
  const first = { kind: "directory", name: "과제" };
  const second = { kind: "directory", name: "완료" };
  const items = [
    { kind: "file", getAsFileSystemHandle: async () => first },
    { kind: "file", getAsFileSystemHandle: async () => { throw new Error("blocked"); } },
    { kind: "file", getAsFileSystemHandle: async () => second },
  ];

  const result = await resolveDroppedHandles(items);

  assert.deepEqual(result.handles, [first, second]);
  assert.equal(result.failedCount, 1);
});
