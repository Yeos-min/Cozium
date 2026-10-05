import assert from "node:assert/strict";
import test from "node:test";
import { buildAppUrl } from "./desktop-helper.mjs";

test("helper opens the root app without an extra path segment", () => {
  assert.equal(buildAppUrl("http://localhost:5173/app.html", 12345, "test-only"),
    "http://localhost:5173/app.html?helper=12345&token=test-only");
});

test("helper preserves a GitHub Pages repository path", () => {
  assert.equal(buildAppUrl("https://example.github.io/cozium/app.html", 12345, "test-only"),
    "https://example.github.io/cozium/app.html?helper=12345&token=test-only");
});

test("helper retains existing query and hash and replaces stale credentials", () => {
  const result = new URL(buildAppUrl("https://example.com/cozium/app.html?view=2d&helper=1&token=old#board", 12345, "test + only"));
  assert.equal(result.pathname, "/cozium/app.html");
  assert.equal(result.searchParams.get("view"), "2d");
  assert.deepEqual(result.searchParams.getAll("helper"), ["12345"]);
  assert.deepEqual(result.searchParams.getAll("token"), ["test + only"]);
  assert.equal(result.hash, "#board");
});

test("helper still supports the default origin-only app URL", () => {
  assert.equal(buildAppUrl("https://example.github.io", 12345, "test-only"),
    "https://example.github.io/?helper=12345&token=test-only");
});
