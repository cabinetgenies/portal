import assert from "node:assert/strict";
import test from "node:test";

import {
  changedOrderRows,
  isMoveDirection,
  reorderAssignments,
} from "@/lib/experience/ordering";

const BEFORE = [
  { key: "home", displayOrder: 10 },
  { key: "projects", displayOrder: 20 },
  { key: "requests", displayOrder: 30 },
];

test("moving an item up or down reorders the list", () => {
  assert.deepEqual(
    reorderAssignments(BEFORE, "requests", "up").map((entry) => entry.key),
    ["home", "requests", "projects"],
  );

  assert.deepEqual(
    reorderAssignments(BEFORE, "home", "down").map((entry) => entry.key),
    ["projects", "home", "requests"],
  );
});

test("moving past either end is a no-op rather than an error", () => {
  assert.deepEqual(
    reorderAssignments(BEFORE, "home", "up").map((entry) => entry.key),
    ["home", "projects", "requests"],
  );

  assert.deepEqual(
    reorderAssignments(BEFORE, "requests", "down").map((entry) => entry.key),
    ["home", "projects", "requests"],
  );
});

test("order is renormalised to steps of ten", () => {
  const after = reorderAssignments(BEFORE, "requests", "up");

  assert.deepEqual(
    after.map((entry) => entry.displayOrder),
    [10, 20, 30],
  );
});

test("only the rows whose order changed are written", () => {
  const after = reorderAssignments(BEFORE, "requests", "up");
  const changed = changedOrderRows(BEFORE, after);

  assert.deepEqual(
    changed.map((entry) => entry.key).sort(),
    ["projects", "requests"],
    "Home stayed at 10 and is not rewritten",
  );
});

test("an unknown key leaves the order settled and unchanged", () => {
  const after = reorderAssignments(BEFORE, "inventory", "up");

  assert.deepEqual(after, BEFORE);
});

test("ties are broken by key, so a move from a tie is deterministic", () => {
  const tied = [
    { key: "sales", displayOrder: 10 },
    { key: "home", displayOrder: 10 },
  ];

  // Home sorts first (same order, earlier key), so Sales moving up swaps them.
  assert.deepEqual(
    reorderAssignments(tied, "sales", "up").map((entry) => entry.key),
    ["sales", "home"],
  );
  assert.deepEqual(
    reorderAssignments(tied, "home", "up").map((entry) => entry.key),
    ["home", "sales"],
    "the first entry cannot move up, and the tie is still settled deterministically",
  );
});

test("only up and down are accepted as directions", () => {
  assert.equal(isMoveDirection("up"), true);
  assert.equal(isMoveDirection("down"), true);
  assert.equal(isMoveDirection("left"), false);
  assert.equal(isMoveDirection(null), false);
});
