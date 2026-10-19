#!/usr/bin/env node
/**
 * Desktop Helper → CoziumHelper.exe (Node 단일 실행 파일, SEA)
 *
 *   node tools/build-helper-exe.mjs --node <Windows용 node.exe 경로> [--out output/helper/CoziumHelper.exe]
 *
 * 하는 일:
 *   1. helper/exe-entry.mjs + desktop-helper.mjs를 CommonJS 한 파일로 묶는다(esbuild, npx로 받음).
 *      SEA는 CommonJS 한 파일만 실행한다.
 *   2. SEA 준비 blob을 만든다(지금 이 스크립트를 돌리는 node가 만든다).
 *   3. node.exe를 복사해 원래 서명(OpenJS)을 떼고 blob을 넣는다(postject, npx로 받음).
 *
 * 주의:
 *   - **blob을 만드는 node와 --node로 주는 node.exe의 버전이 같아야 한다.** 다르면 exe가 시작하지 않는다.
 *     2026-10-19 빌드: 둘 다 v22.22.0 (npm 패키지 node-win-x64@22.22.0의 bin/node.exe).
 *   - 결과 exe는 서명이 없다. Chrome·SmartScreen 경고가 뜬다(CLAUDE.md §8-6).
 *   - Windows가 아닌 곳에서도 빌드는 되지만, exe 실행 확인은 Windows에서만 된다.
 *   - 결과물(`output/`)은 저장소에 올리지 않는다. GitHub Releases에 CoziumHelper.exe로 올린다.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ESBUILD = "esbuild@0.28.2";
const POSTJECT = "postject@1.0.0-alpha.6";
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function args(argv) {
  const o = { node: null, out: path.join(ROOT, "output", "helper", "CoziumHelper.exe") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--node") o.node = argv[++i];
    else if (argv[i] === "--out") o.out = path.resolve(argv[++i]);
  }
  return o;
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, list) => execFileSync(cmd, list, { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" });

/** PE(Windows exe)의 Authenticode 서명을 뗀다. 서명된 node.exe에 blob을 넣으면 서명이 깨진 채 남기 때문이다. */
export function stripPeSignature(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) return { buf, stripped: false }; // "MZ"가 아니면 PE 아님(리눅스 테스트 빌드)
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) throw new Error("PE 헤더를 못 찾았습니다.");
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  const dirs = opt + (magic === 0x20b ? 112 : 96); // PE32+ : PE32
  const secEntry = dirs + 4 * 8; // IMAGE_DIRECTORY_ENTRY_SECURITY
  const offset = buf.readUInt32LE(secEntry);
  const size = buf.readUInt32LE(secEntry + 4);
  if (!size) return { buf, stripped: false };
  if (offset + size !== buf.length) throw new Error("서명이 파일 끝에 있지 않습니다. 떼지 않고 멈춥니다.");
  const out = Buffer.from(buf.subarray(0, offset));
  out.writeUInt32LE(0, secEntry);
  out.writeUInt32LE(0, secEntry + 4);
  out.writeUInt32LE(0, opt + 64); // CheckSum — 사용자 모드 exe는 검사하지 않지만 틀린 값을 남기지 않는다
  return { buf: out, stripped: true };
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.node || !fs.existsSync(o.node)) {
    console.error("사용법: node tools/build-helper-exe.mjs --node <Windows용 node.exe> [--out <경로>]");
    console.error(`blob을 만드는 node: ${process.version} — --node도 같은 버전이어야 합니다.`);
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cozium-sea-"));
  const bundle = path.join(tmp, "helper.cjs");
  const blob = path.join(tmp, "helper.blob");

  console.log(`1/3 묶기 (${ESBUILD})`);
  run(npx, ["--yes", ESBUILD, "helper/exe-entry.mjs", "--bundle", "--platform=node", "--format=cjs", "--target=node22",
    "--log-override:empty-import-meta=silent", `--outfile=${bundle}`]);

  console.log(`2/3 SEA blob (node ${process.version})`);
  fs.writeFileSync(path.join(tmp, "sea-config.json"), JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false, // 코드 캐시는 빌드한 기계에 묶인다. 리눅스에서 Windows용을 만들므로 끈다.
  }, null, 2));
  execFileSync(process.execPath, ["--experimental-sea-config", path.join(tmp, "sea-config.json")], { stdio: "inherit" });

  console.log(`3/3 넣기 (${POSTJECT})`);
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  const { buf, stripped } = stripPeSignature(fs.readFileSync(o.node));
  fs.writeFileSync(o.out, buf, { mode: 0o755 });
  console.log(stripped ? "  원래 node.exe 서명을 뗐습니다." : "  떼어 낼 서명 없음.");
  run(npx, ["--yes", POSTJECT, o.out, "NODE_SEA_BLOB", blob, "--sentinel-fuse", FUSE]);

  const final = fs.readFileSync(o.out);
  console.log(`\n완료: ${o.out}`);
  console.log(`크기 ${(final.length / 1024 / 1024).toFixed(1)} MB · SHA-256 ${createHash("sha256").update(final).digest("hex")}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
