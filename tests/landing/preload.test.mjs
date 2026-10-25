import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

// The landing (index.html + js/landing-story/story.js). Since 2026-10-11 the first and last rooms are the user's 3D
// attic (models/room.glb, js/landing-story/room-layer.js); before that they were painted plates (backup in
// _archive/claude-landing-3d-20261011/). The older Canvas-2D landing lives on in landing-classic.html.
const root = new URL("../../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("css/fonts.css", root), "utf8"); // 10-24: 글꼴은 fonts.css 한 곳
const story = await readFile(new URL("js/landing-story/story.js", root), "utf8");
const roomLayer = await readFile(new URL("js/landing-story/room-layer.js", root), "utf8");

const preloads = [...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*>/g)].map(([tag]) => ({
  tag,
  href: tag.match(/\bhref="([^"]+)"/)?.[1],
  as: tag.match(/\bas="([^"]+)"/)?.[1],
}));

test("first-frame preloads: the still of the first camera, the room model and the two title fonts, nothing else", () => {
  const images = preloads.filter((link) => link.as === "image").map((link) => link.href);
  assert.equal(images.length, 1, "one still: the poster shown while the room loads");
  const poster = html.match(/<img class="poster" id="poster" src="([^"]+)"/)?.[1];
  assert.equal(images[0], poster, "the preloaded still is the one the first frame draws");
  assert.match(poster, /\.webp$/);
  const model = preloads.find((link) => link.as === "fetch");
  assert.equal(model?.href, "./models/room.glb");
  assert.match(model.tag, /\bcrossorigin\b/, "fetch() is CORS-mode; without crossorigin the preload is not reused");
  assert.ok(story.includes(`room.load("${model.href}"`), "the story loads the preloaded model");
  assert.equal(preloads.length, 4); // poster, room.glb, Nunito 900 (로고), 나눔스퀘어라운드 B (문구·버튼)
});

test("every preloaded file exists and the font preload can be reused by @font-face", async () => {
  for (const { href } of preloads) await access(new URL(href, root));
  const fonts = preloads.filter((link) => link.as === "font");
  assert.equal(fonts.length, 2, "the logo (Nunito 900) and the words under it (NanumSquareRound B)");
  const faces = [...css.matchAll(/@font-face\{[^}]*url\("\.\.\/([^"]+)"\)/g)].map((m) => `./${m[1]}`);
  for (const font of fonts) {
    assert.match(font.tag, /\bcrossorigin\b/, "font requests are CORS-mode; without crossorigin the preload is not reused");
    assert.ok(faces.includes(font.href), `${font.href} is one of css/fonts.css's faces`);
  }
  assert.match(html, /href="\.\/css\/fonts\.css"/, "the landing reads the shared font sheet");
});

test("every asset the landing loads exists and three.js comes from the vendored copy", async () => {
  const urls = new Set([
    ...[...html.matchAll(/\b(?:src|href)="(\.\/[^"?#]+)"/g)].map((m) => m[1]),
    ...[...story.matchAll(/["`](\.\/(?:assets|models)\/[^"`$]+)["`]/g)].map((m) => m[1]),
  ]);
  for (const kind of ["document", "photo", "video", "audio", "archive"]) urls.add(`./assets/landing/parts/desktop-v4/faces/${kind}.webp`);
  for (const kind of ["document", "photo", "video", "audio", "archive", "folder-sage", "folder-sand"]) urls.add(`./assets/landing/parts/desktop-v4/icons/${kind}.webp`);
  for (const cam of ["A", "B", "C"]) urls.add(`./assets/landing/room-3d/poster-${cam}.webp`); // the ?lab panel can switch cameras
  for (const url of urls) await access(new URL(url, root));
  // 10-11 clean-up: the old landing's pictures (assets/landing/box/, desktop-v3) are no longer in the repository
  for (const url of urls) assert.doesNotMatch(url, /assets\/landing\/(box|parts\/desktop-v3)\//, url);
  const map = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]);
  assert.equal(map.imports.three, "./vendor/three/three.module.min.js");
  await access(new URL(map.imports.three, root));
  // the room layer reuses the game's effect code (one style for landing and game) and the vendored loader
  for (const spec of [...roomLayer.matchAll(/from "(\.\.?\/[^"]+)"/g)].map((m) => m[1])) await access(new URL(spec, new URL("js/landing-story/", root)));
  assert.match(roomLayer, /from "\.\.\/three\/outline-effect\.js"/);
  assert.match(roomLayer, /from "\.\.\/three\/vertex-snap\.js"/);
});

test("one way in: the tidied room's button goes to the organizer, and back returns to the tidied room", () => {
  const links = [...html.matchAll(/<nav class="cta"[^>]*>([\s\S]*?)<\/nav>/g)].flatMap((m) => [...m[1].matchAll(/href="([^"]+)"/g)].map((l) => l[1]));
  assert.deepEqual(links, ["./app.html"], "the organizer's own screen offers files, sample and helper (10-09 plan)");
  assert.match(html, /<a class="end-go" id="endGo" href="\.\/app\.html"/, "10-25: the tidied room's own button (filled) walks into the same organizer");
  assert.match(html, /<script src="\.\/js\/entry-route\.js"><\/script>/, "old app links that land on index.html still reach the organizer");
  assert.match(story, /history\.replaceState\(null, "", "#end"\)/, "leaving marks this entry so back lands on the last room");
  assert.match(story, /const cameBack = location\.hash === "#end";/);
  assert.match(story, /addEventListener\("pageshow"/, "a page restored from the back-forward cache rests on the tidied room too");
});

test("the review panel stays off the real landing unless asked for", () => {
  assert.doesNotMatch(html, /data-lab="always"/);
  assert.match(story, /new URLSearchParams\(location\.search\)\.has\("lab"\)/);
});
