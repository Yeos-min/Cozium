// npm test가 부르는 테스트 실행기: tests/와 helper/ 아래 *.test.js·*.test.mjs를 이름 순으로 모아 node --test로 한 번에 돌린다.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(file));
    else if (/\.test\.(?:js|mjs)$/.test(entry.name)) files.push(file);
  }
  return files;
}

const files = [...await collect(path.join(root, "tests")), ...await collect(path.join(root, "helper"))];
if (!files.length) throw new Error("No active test files found.");
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
