import assert from "node:assert/strict";
import test from "node:test";

import {
  canFinalizeReview,
  employeeReviewTransitionAllowed,
  reviewActorFor,
} from "@/lib/performance/review-authorization";

test("an employee is only the review employee, never a manager", () => {
  const actor = reviewActorFor({
    userId: "employee-1",
    employeeId: "employee-1",
    managerId: "manager-1",
    isAdmin: false,
  });

  assert.equal(actor.isEmployee, true);
  assert.equal(actor.isManager, false);
  assert.equal(actor.canManage, false);
});

test("a manager is not treated as the employee of someone else's review", () => {
  const actor = reviewActorFor({
    userId: "manager-1",
    employeeId: "employee-1",
    managerId: "manager-1",
    isAdmin: false,
  });

  assert.equal(actor.isEmployee, false);
  assert.equal(actor.isManager, true);
  assert.equal(actor.canManage, true);
});

test("employees may submit input but not finalize", () => {
  assert.equal(employeeReviewTransitionAllowed("in_progress", "employee_input"), true);
  assert.equal(employeeReviewTransitionAllowed("complete", "employee_input"), false);
  assert.equal(employeeReviewTransitionAllowed("in_progress", "complete"), false);
});

test("only managers or administrators can finalize an open review", () => {
  const employee = reviewActorFor({
    userId: "employee-1",
    employeeId: "employee-1",
    managerId: "manager-1",
    isAdmin: false,
  });
  const manager = reviewActorFor({
    userId: "manager-1",
    employeeId: "employee-1",
    managerId: "manager-1",
    isAdmin: false,
  });
  const admin = reviewActorFor({
    userId: "admin-1",
    employeeId: "employee-1",
    managerId: "manager-1",
    isAdmin: true,
  });

  assert.equal(canFinalizeReview(employee, "in_progress"), false);
  assert.equal(canFinalizeReview(manager, "in_progress"), true);
  assert.equal(canFinalizeReview(admin, "in_progress"), true);
  assert.equal(canFinalizeReview(manager, "complete"), false);
});

