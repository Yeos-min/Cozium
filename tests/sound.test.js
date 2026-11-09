// 소리(11-09): 코드가 부르는 효과음 이름이 js/sound.js에 다 있는지, 배경음악 파일과 반복 구간이 맞는지 잠근다.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const source = readFileSync(join(root, "js/sound.js"), "utf8");
const recipes = source.slice(source.indexOf("const RECIPES"), source.indexOf("const MIN_GAP"));
const known = new Set([...recipes.matchAll(/^\s+(\w+): \(v[^)]*\)/gm)].map((m) => m[1]));

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsFiles(path) : path.endsWith(".js") ? [path] : [];
  });
}

test("every sound.play name has a recipe", () => {
  assert.deepEqual([...known].sort(), ["box", "done", "go", "gulp", "laptop", "page", "pick", "pin", "pop", "throw", "ui"]);
  for (const file of jsFiles(join(root, "js"))) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(/sound\.play\("(\w+)"/g)) {
      assert.ok(known.has(name), `${file}: 「${name}」 소리가 js/sound.js RECIPES에 없습니다`);
    }
  }
});

test("every data-sfx name has a recipe", () => {
  for (const page of ["index.html", "app.html"]) {
    for (const [, name] of readFileSync(join(root, page), "utf8").matchAll(/data-sfx="(\w+)"/g)) {
      assert.ok(known.has(name), `${page}: data-sfx「${name}」 소리가 js/sound.js RECIPES에 없습니다`);
    }
  }
});

test("the music file is there and the loop sits inside it", () => {
  const bytes = statSync(join(root, "assets/audio/bgm.mp3")).size;
  assert.ok(bytes > 1_000_000, "assets/audio/bgm.mp3가 없거나 너무 작습니다");
  const start = Number(source.match(/LOOP_START = ([\d.]+)/)[1]), end = Number(source.match(/LOOP_END = ([\d.]+)/)[1]);
  assert.ok(start >= 0 && start < 0.1 && end > start && end < 68.57, "반복 구간이 곡(68.57초) 밖입니다");
});
