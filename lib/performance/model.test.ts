import assert from "node:assert/strict";
import test from "node:test";

import {
  isOverdue,
  measurableStatusLabel,
  performanceAccessLevel,
  priorityStatusLabel,
  quarterLabel,
} from "@/lib/performance/model";

test("scorecard and priority statuses have stable plain-language labels", () => {
  assert.equal(measurableStatusLabel("on_track"), "On Track");
  assert.equal(measurableStatusLabel("off_track"), "Off Track");
  assert.equal(measurableStatusLabel("no_data"), "No Data");
  assert.equal(priorityStatusLabel("not_started"), "Not Started");
  assert.equal(priorityStatusLabel("complete"), "Complete");
});

test("quarters are displayed as Q{quarter} {year}", () => {
  assert.equal(quarterLabel(3, 2026), "Q3 2026");
  assert.equal(quarterLabel(null, null), "Unknown");
});

test("overdue actions are open and past their due date", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  assert.equal(
    isOverdue({ dueDate: "2026-09-14", completedAt: null, now }),
    true,
  );
  assert.equal(
    isOverdue({ dueDate: "2026-09-15", completedAt: null, now }),
    false,
  );
  assert.equal(
    isOverdue({ dueDate: "2026-09-01", completedAt: "2026-09-02T00:00:00Z", now }),
    false,
  );
});

test("performance access level maps capabilities fail-closed", () => {
  assert.equal(performanceAccessLevel([]), "none");
  assert.equal(performanceAccessLevel(["view:performance-own"]), "own");
  assert.equal(
    performanceAccessLevel(["view:performance-own", "view:performance-team"]),
    "team",
  );
  assert.equal(performanceAccessLevel(["view:performance-all"]), "all");
  assert.equal(performanceAccessLevel(["manage:performance"]), "all");
});

