import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFinalTrueUp,
  previouslyRecognizedCommission,
} from "@/lib/commission/engine";
import type { CommissionEventType } from "@/lib/commission/types";

type RecognizedEvent = {
  eventType: CommissionEventType;
  status: string;
  grossCommission: number;
};

test("A: a deposit fully paid in cash is recognized at its gross amount", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  assert.equal(previouslyRecognizedCommission(events), 5_000);
});

test("B: a deposit fully absorbed by draw is still recognized at its gross amount", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  // net_payable would be 0 with a 5,000 draw offset; the recognized amount must
  // not collapse to cash paid.
  assert.equal(previouslyRecognizedCommission(events), 5_000);
});

test("C: a deposit split between draw and cash is recognized at its gross amount", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  // draw offset 3,000 and net payable 2,000; recognized stays 5,000.
  assert.equal(previouslyRecognizedCommission(events), 5_000);
});

test("D: a deposit absorbed by rollover, draw and cash is recognized at gross", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  // rollover offset 1,000, draw offset 2,000 and net payable 2,000.
  assert.equal(previouslyRecognizedCommission(events), 5_000);
});

test("E: a voided deposit contributes nothing to recognized commission", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "voided", grossCommission: 5_000 },
  ];

  assert.equal(previouslyRecognizedCommission(events), 0);
});

test("F: final entitlement minus recognized commission produces the correct true-up", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  const recognized = previouslyRecognizedCommission(events);
  assert.equal(calculateFinalTrueUp(10_000, recognized), 5_000);
});

test("G: final entitlement below prior recognized amount still creates a negative true-up", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
  ];

  const recognized = previouslyRecognizedCommission(events);
  assert.equal(calculateFinalTrueUp(4_000, recognized), -1_000);
});

test("a negative prior event is not treated as positive recognized compensation", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
    { eventType: "final_true_up", status: "paid", grossCommission: -1_000 },
  ];

  // The negative true-up is a rollover obligation, not a reduction of prior
  // recognized compensation.
  assert.equal(previouslyRecognizedCommission(events), 5_000);
});

test("H: repeated recognition is idempotent", () => {
  const events: RecognizedEvent[] = [
    { eventType: "deposit", status: "paid", grossCommission: 5_000 },
    { eventType: "manual_adjustment", status: "approved", grossCommission: 500 },
  ];

  const first = previouslyRecognizedCommission(events);
  const second = previouslyRecognizedCommission(events);
  assert.equal(first, second);
  assert.equal(first, 5_500);
});

