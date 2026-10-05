import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/entry-route.js", import.meta.url), "utf8");

function redirectOf(href) {
  const location = new URL(href);
  let redirected;
  location.replace = (next) => { redirected = next; };
  vm.runInNewContext(source, { window: { location }, URL, URLSearchParams });
  return redirected;
}

test("ordinary and inspection links stay on the landing", () => {
  for (const suffix of ["", "?inspectFocus=1", "?inspectDesktop=1#preview", "?utm_source=github"]) {
    assert.equal(redirectOf(`https://example.com/cozium/index.html${suffix}`), undefined);
  }
});

test("old sample entry preserves the repository path, query and hash", () => {
  assert.equal(
    redirectOf("https://example.com/cozium/?entry=sample&storage=memory#board"),
    "https://example.com/cozium/app.html?entry=sample&storage=memory#board",
  );
});

test("old helper entry preserves connection parameters without losing the app path", () => {
  assert.equal(
    redirectOf("http://localhost:5173/index.html?helper=12345&token=test-only-token"),
    "http://localhost:5173/app.html?helper=12345&token=test-only-token",
  );
});

test("legacy development options open the organizer", () => {
  for (const query of ["storage=memory", "view=2d", "layout=grid", "seed=1&capacity=24", "token=test-only-token"]) {
    assert.equal(redirectOf(`http://localhost:5173/?${query}`), `http://localhost:5173/app.html?${query}`);
  }
});
