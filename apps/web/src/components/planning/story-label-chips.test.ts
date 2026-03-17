import assert from "node:assert/strict";
import test from "node:test";

import {
  splitVisibleStoryLabels,
  toLabelChipStyle,
  type WorkItemLabel,
} from "./story-label-chips.js";

const LABELS: WorkItemLabel[] = [
  { id: "l1", name: "planning", color: "#ff0000" },
  { id: "l2", name: "boards", color: "#00ff00" },
  { id: "l3", name: "ui", color: "#0000ff" },
];

test("splitVisibleStoryLabels returns visible labels and overflow count", () => {
  const result = splitVisibleStoryLabels(LABELS, 2);

  assert.deepEqual(
    result.visible.map((label) => label.id),
    ["l1", "l2"],
  );
  assert.equal(result.overflowCount, 1);
});

test("splitVisibleStoryLabels handles zero and negative maxVisible", () => {
  const zero = splitVisibleStoryLabels(LABELS, 0);
  const negative = splitVisibleStoryLabels(LABELS, -3);

  assert.equal(zero.visible.length, 0);
  assert.equal(zero.overflowCount, 3);
  assert.equal(negative.visible.length, 0);
  assert.equal(negative.overflowCount, 3);
});

test("toLabelChipStyle normalizes shorthand hex colors and adds alpha variants", () => {
  const style = toLabelChipStyle("#0f0");

  assert.deepEqual(style, {
    color: "#00ff00",
    borderColor: "#00ff0066",
    backgroundColor: "#00ff001a",
  });
});

test("toLabelChipStyle returns undefined for invalid colors", () => {
  assert.equal(toLabelChipStyle("red"), undefined);
  assert.equal(toLabelChipStyle(null), undefined);
});
