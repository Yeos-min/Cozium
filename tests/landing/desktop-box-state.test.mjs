import assert from "node:assert/strict";
import test from "node:test";
import { getCollectionBoxPose, COLLECTION_BOX_DESIGN } from "../../js/landing/desktop-interaction.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("the approved PNG crop keeps its proportions and rests on the file floor", () => {
  const pose = getCollectionBoxPose();
  near(pose.rect.width / pose.rect.height, 1459 / 866);
  near(pose.rect.y + pose.rect.height, 820);
  assert.deepEqual(COLLECTION_BOX_DESIGN.sourceRect, [43, 101, 1459, 866]);
  assert.ok(pose.mouth.x >= pose.rect.x && pose.mouth.x + pose.mouth.width <= pose.rect.x + pose.rect.width);
  assert.ok(pose.mouth.y >= pose.rect.y && pose.mouth.y + pose.mouth.height <= pose.rect.y + pose.rect.height);
});

test("the feedback scale expands both aperture and artwork about a fixed center", () => {
  const base = getCollectionBoxPose(1), expanded = getCollectionBoxPose(1.12);
  near(expanded.rect.width, base.rect.width * 1.12);
  near(expanded.rect.height, base.rect.height * 1.12);
  near(expanded.rect.x + expanded.rect.width / 2, base.rect.x + base.rect.width / 2);
  near(expanded.rect.y + expanded.rect.height / 2, base.rect.y + base.rect.height / 2);
  near(expanded.mouth.width, base.mouth.width * 1.12);
  near(expanded.mouth.height, base.mouth.height * 1.12);
  assert.ok(expanded.dropRect.width > expanded.mouth.width);
  assert.ok(expanded.dropRect.height > expanded.mouth.height);
});

test("feedback inputs clamp to the supported visual scale and returned rectangles are independent", () => {
  for (const value of [-5, 0, NaN, Infinity, undefined]) assert.deepEqual(getCollectionBoxPose(value), getCollectionBoxPose(1));
  assert.deepEqual(getCollectionBoxPose(5), getCollectionBoxPose(1.12));
  const pose = getCollectionBoxPose(1.12); pose.rect.x = -500; pose.mouth.width = 0;
  assert.ok(getCollectionBoxPose(1.12).rect.x > 0);
  assert.ok(getCollectionBoxPose(1.12).mouth.width > 0);
});
