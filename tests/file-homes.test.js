import assert from "node:assert/strict";
import test from "node:test";
import { HomeSlots, fileHome } from "../js/three/file-homes.js";
import { placeFloorItems } from "../js/ui/floor-layout.js";
import { SessionStore } from "../js/state/session-store.js";

const item = (id, extension) => ({ id, name: `${id}.${extension}`, extension, size: 2048 });
const BOUNDS = { x: 0, y: 0, width: 1060, height: 810 };
const CARD = { width: 110, height: 66 };

test("images and text notes start on the pinboard, documents on the book pile, everything else on the floor", () => {
  for (const ext of ["png", "JPG", "heic", "txt", "md"]) assert.equal(fileHome({ extension: ext }), "pinboard");
  for (const ext of ["pdf", "docx", "HWP", "hwpx", "doc"]) assert.equal(fileHome({ extension: ext }), "books");
  for (const ext of ["pptx", "xlsx", "zip", "mp4", "", undefined]) assert.equal(fileHome({ extension: ext }), "floor");
});

test("home files take no floor slot until their place is full, then they fall back to the floor", () => {
  const items = [item("a", "png"), item("b", "png"), item("c", "png"), item("d", "pdf"), item("e", "zip")];
  const spots = placeFloorItems({ items, bounds: BOUNDS, seed: 1, config: { card: CARD, home: fileHome, homeCapacity: { pinboard: 2, books: 5 } } });
  const homes = [...spots.values()].map((spot) => spot.home ?? "floor");
  assert.equal(homes.filter((home) => home === "pinboard").length, 2);
  assert.equal(homes.filter((home) => home === "books").length, 1);
  assert.equal(homes.filter((home) => home === "floor").length, 2, "the third image and the zip");
  // existing home entries count against the capacity but never block a floor slot
  const existing = [{ x: 0, y: 0, rot: 0, width: CARD.width, height: CARD.height, home: "pinboard" }];
  const more = placeFloorItems({ items: [item("f", "png"), item("g", "png")], bounds: BOUNDS, existing, seed: 1,
    config: { card: CARD, home: fileHome, homeCapacity: { pinboard: 2 } } });
  assert.deepEqual([...more.values()].map((spot) => spot.home ?? "floor").sort(), ["floor", "pinboard"]);
});

test("the store keeps a file's home until the player puts it down somewhere", () => {
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor", card: CARD, home: fileHome, homeCapacity: { pinboard: 20, books: 24 } }, seed: 3 });
  store.addFiles([item("p", "png"), item("q", "pdf"), item("r", "zip")]);
  assert.equal(store.entry("p").position.home, "pinboard");
  assert.equal(store.entry("q").position.home, "books");
  assert.equal(store.entry("r").position.home, undefined);
  store.setPositions([{ id: "p", x: 300, y: 300 }]);
  assert.equal(store.entry("p").position.home, undefined);
  assert.equal(store.entry("p").position.x, 300);
});

test("home slots stay put as files come and go, and freed slots are reused", () => {
  const slots = new HomeSlots();
  const first = slots.assign(new Map([["pinboard", ["a", "b", "c"]]]));
  assert.deepEqual([...first.values()].map((slot) => slot.index), [0, 1, 2]);
  const second = slots.assign(new Map([["pinboard", ["a", "c", "d"]]]));
  assert.equal(second.get("a").index, 0);
  assert.equal(second.get("c").index, 2);
  assert.equal(second.get("d").index, 1, "d takes b's freed slot");
});

test("a photo taken off the pinboard can be pinned back, up to the pinboard's capacity", () => {
  const store = new SessionStore({ bounds: BOUNDS, layout: { mode: "floor", card: CARD, home: fileHome, homeCapacity: { pinboard: 2, books: 24 } }, seed: 3 });
  store.addFiles([item("p", "png"), item("q", "jpg"), item("s", "png")]);
  assert.deepEqual(["p", "q", "s"].map((id) => store.entry(id).position.home ?? "floor"), ["pinboard", "pinboard", "floor"]);
  store.setPositions([{ id: "p", x: 300, y: 300 }]); // taken off and put on the floor
  assert.equal(store.entry("p").position.home, undefined);
  assert.deepEqual(store.setHome(["p", "s"], "pinboard"), ["p"], "only one free slot left");
  assert.equal(store.entry("p").position.home, "pinboard");
  assert.equal(store.entry("s").position.home, undefined);
});
