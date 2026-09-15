import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPENSATION_EVENT_TYPES,
  COMPENSATION_PLAN_TYPES,
  IMPLEMENTED_PARTICIPANT_KINDS,
  PARTICIPANT_KINDS,
  isCompensationPlanType,
  isParticipantKind,
  isParticipantKindImplemented,
  participantKindLabel,
} from "@/lib/compensation/types";

test("the compensation vocabulary covers designers and managers", () => {
  assert.deepEqual([...PARTICIPANT_KINDS], ["sales_designer", "sales_manager"]);
});

test("only sales designer plans are implemented today", () => {
  assert.equal(isParticipantKindImplemented("sales_designer"), true);
  assert.equal(isParticipantKindImplemented("sales_manager"), false);
  assert.deepEqual([...IMPLEMENTED_PARTICIPANT_KINDS], ["sales_designer"]);
});

test("unknown participant kinds and plan types are rejected", () => {
  assert.equal(isParticipantKind("sales_manager"), true);
  assert.equal(isParticipantKind("split_commission"), false);
  assert.equal(isCompensationPlanType("straight_gp"), true);
  assert.equal(isCompensationPlanType("designer_split"), false);
  assert.equal(participantKindLabel("split_commission"), "Unknown");
  assert.deepEqual([...COMPENSATION_PLAN_TYPES], ["straight_gp"]);
});

test("reserved compensation event types keep manager events separate from designer events", () => {
  const designerEvent = COMPENSATION_EVENT_TYPES.find(
    (event) => event.participantKind === "sales_designer",
  );
  const managerEvent = COMPENSATION_EVENT_TYPES.find(
    (event) => event.participantKind === "sales_manager",
  );

  assert.ok(designerEvent);
  assert.ok(managerEvent);
  assert.notEqual(designerEvent.code, managerEvent.code);
  assert.match(managerEvent.description, /never a share/i);
});
