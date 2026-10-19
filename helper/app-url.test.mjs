import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APP_URL, DEFAULT_ORIGINS, buildAppUrl } from "./desktop-helper.mjs";

test("helper opens the root app without an extra path segment", () => {
  assert.equal(buildAppUrl("http://localhost:5173/app.html", 12345, "test-only"),
    "http://localhost:5173/app.html#helper=12345&token=test-only");
});

test("helper preserves a GitHub Pages repository path", () => {
  assert.equal(buildAppUrl("https://example.github.io/cozium/app.html", 12345, "test-only"),
    "https://example.github.io/cozium/app.html#helper=12345&token=test-only");
});

test("credentials ride in the fragment (never sent to the server); other query stays, stale query credentials go (10-20)", () => {
  const result = new URL(buildAppUrl("https://example.com/cozium/app.html?view=2d&helper=1&token=old#board", 12345, "test + only"));
  assert.equal(result.pathname, "/cozium/app.html");
  assert.equal(result.searchParams.get("view"), "2d");
  assert.equal(result.searchParams.has("helper"), false);
  assert.equal(result.searchParams.has("token"), false);
  const hash = new URLSearchParams(result.hash.slice(1));
  assert.equal(hash.get("helper"), "12345");
  assert.equal(hash.get("token"), "test + only");
});

test("helper still supports the default origin-only app URL", () => {
  assert.equal(buildAppUrl("https://example.github.io", 12345, "test-only"),
    "https://example.github.io/#helper=12345&token=test-only");
});

test("default app page is the deployed Cozium app on an allowed origin", () => {
  const app = new URL(DEFAULT_APP_URL);
  assert.equal(app.origin, "https://yeos-min.github.io");
  assert.equal(app.pathname, "/Cozium/app.html");
  assert.ok(DEFAULT_ORIGINS.includes(app.origin), "Helper가 연 페이지의 요청을 스스로 403으로 막으면 안 된다");
});
