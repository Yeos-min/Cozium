// v0.2.3 짝짓기: 이미 열어 둔 Cozium 탭이 고정 포트로 Helper를 찾아 토큰을 받아 간다.
// 토큰은 허용 출처에만 준다 — 이 검사가 무너지면 아무 사이트나 바탕화면 파일을 옮길 수 있다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { HELPER_PORT, createDesktopSession, createHelperServer, parseArgs } from "./desktop-helper.mjs";

async function startServer(onPair = () => {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cozium-pair-"));
  await fs.writeFile(path.join(dir, "메모.txt"), "a");
  const session = await createDesktopSession({ desktopPath: dir });
  const server = createHelperServer({ session, token: "secret-token", allowedOrigins: ["https://example.test"], onPair });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/v1`, dir };
}

test("pair hands the token to an allowed origin, and that token then works", async () => {
  let pairs = 0;
  const { server, base } = await startServer(() => (pairs += 1));
  const paired = await fetch(`${base}/pair`, { headers: { Origin: "https://example.test" } });
  assert.equal(paired.status, 200);
  const body = await paired.json();
  assert.equal(body.token, "secret-token");
  assert.equal(pairs, 1);
  const scan = await fetch(`${base}/scan`, { headers: { Origin: "https://example.test", Authorization: `Bearer ${body.token}` } });
  assert.equal(scan.status, 200);
  await new Promise((resolve) => server.close(resolve));
});

test("pair refuses other origins and requests with no origin", async () => {
  const { server, base } = await startServer();
  const other = await fetch(`${base}/pair`, { headers: { Origin: "https://evil.example" } });
  assert.equal(other.status, 403);
  assert.equal((await other.json()).token, undefined);
  const none = await fetch(`${base}/pair`);
  assert.equal(none.status, 403);
  await new Promise((resolve) => server.close(resolve));
});

test("only GET /v1/pair skips the token; everything else still needs it", async () => {
  const { server, base } = await startServer();
  const post = await fetch(`${base}/pair`, { method: "POST", headers: { Origin: "https://example.test" } });
  assert.equal(post.status, 401);
  const hello = await fetch(`${base}/hello`, { headers: { Origin: "https://example.test" } });
  assert.equal(hello.status, 401);
  await new Promise((resolve) => server.close(resolve));
});

test("port defaults to the fixed Helper port; --port 0 still means random", () => {
  assert.equal(parseArgs([]).port, null);
  assert.equal(parseArgs(["--port", "0"]).port, 0);
  assert.equal(HELPER_PORT, 47821);
});
