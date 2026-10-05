import assert from "node:assert/strict";
import test from "node:test";
import { getDesktopPoint } from "../../js/landing/desktop-interaction.js";
import { getDesktopTransition } from "../../js/landing/desktop-scene.js";

test("desktop pointer mapping survives uniform responsive scaling", () => {
  for (const [width, height] of [[1280,720],[2934,1532],[390,844]]) {
    const rect = getDesktopTransition(width,height,1).desktopRect;
    const bounds = { left: 40, top: 65, width, height };
    const expected = { x: 1360, y: 700 };
    const point = getDesktopPoint(bounds.left + rect.x + expected.x * rect.scale, bounds.top + rect.y + expected.y * rect.scale, bounds, rect);
    assert.ok(Math.abs(point.x - expected.x) < 1e-8);
    assert.ok(Math.abs(point.y - expected.y) < 1e-8);
    assert.equal(getDesktopPoint(bounds.left - 1,bounds.top + 10,bounds,rect), null);
    assert.equal(getDesktopPoint(bounds.left + 10,bounds.top - 1,bounds,rect), null);
    assert.equal(getDesktopPoint(bounds.left + width + 1,bounds.top + 10,bounds,rect), null);
  }
});

test("the extended monitor background accepts clicks on a wide or portrait viewport", () => {
  for (const [width, height] of [[2400,1000],[390,844]]) {
    const rect = getDesktopTransition(width,height,1).desktopRect;
    const bounds = { left: 40, top: 65, width, height };
    const point = getDesktopPoint(bounds.left + 20,bounds.top + 20,bounds,rect);
    assert.ok(point);
    assert.ok(point.x < 0 || point.y < 0);
    assert.equal(getDesktopPoint(bounds.left + 20,bounds.top + height + 1,bounds,rect),null);
  }
});

test("an unavailable or invalid display scale cannot start an interaction", () => {
  for (const rect of [null,{}, {scale:0},{scale:-1}]) assert.equal(getDesktopPoint(10,10,{left:0,top:0},rect),null);
});
