// app.html의 보안 정책(CSP, 2026-10-20)이 실제 페이지와 어긋나지 않는지 잠근다. CLAUDE.md §8-9.
// importmap을 고치면 sha256이 바뀐다 — 이 테스트가 실패하면 메시지의 값으로 app.html의 script-src를 바꾼다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // 브라우저도 줄바꿈을 \n으로 바꾼 뒤 해시한다
const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
const directive = (name) => policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";

test("app.html declares a CSP before anything loads", () => {
  assert.ok(policy, "CSP meta가 없습니다");
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<link"), "CSP는 css·script보다 먼저 와야 합니다");
});

test("the importmap's hash in script-src matches the importmap in the page", () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1, "app.html 안에 직접 쓴 스크립트는 importmap 하나여야 합니다(나머지는 막힙니다)");
  const hash = createHash("sha256").update(inline[0][1]).digest("base64");
  assert.ok(directive("script-src").includes(`'sha256-${hash}'`), `importmap이 바뀌었습니다. script-src를 'sha256-${hash}'로 바꾸세요.`);
  assert.ok(!directive("script-src").includes("unsafe-inline") && !directive("script-src").includes("unsafe-eval"));
});

test("the page may talk to the Desktop Helper and nothing outside the site", () => {
  const connect = directive("connect-src");
  assert.ok(connect.includes("http://127.0.0.1:*"), "Helper(127.0.0.1)로 못 붙습니다");
  assert.ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(connect), "외부 주소가 connect-src에 들어 있습니다 — 일부러 넣은 게 맞는지 확인");
  assert.match(directive("object-src"), /'none'/);
});

test("no inline event handlers in app.html (CSP blocks them)", () => {
  assert.equal(/<[^>]+\son[a-z]+\s*=/i.test(html.replace(/<!--[\s\S]*?-->/g, "")), false);
});
