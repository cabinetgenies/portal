import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFinalTrueUp,
  previouslyRecognizedCommission,
} from "@/lib/commission/engine";

/**
 * Phase 7A preflight regression: a deposit that was fully credited against draw
 * leaves `net_payable` at zero. The current "already recognized" helper sums
 * `net_payable`, so it treats that earned deposit as zero and overstates the
 * final true-up.
 *
 * This test intentionally captures the current behaviour so the defect stays
 * visible until the settlement rules are resolved separately. It must not be
 * "fixed" by changing history or stored events in this AI phase.
 */

test("a drawn-down deposit understates recognized and overstates final true-up", () => {
  // $5,000 deposit gross, fully credited against a $5,000 draw balance, so no
  // cash was payable. Final audited gross commission is $10,000.
  const deposit = {
    eventType: "deposit" as const,
    status: "paid",
    netPayable: 0,
  };

  const recognized = previouslyRecognizedCommission([deposit]);
  assert.equal(recognized, 0);

  const trueUp = calculateFinalTrueUp(10_000, recognized);
  assert.equal(trueUp, 10_000);

  // The correct answer should recognize the $5,000 of earned deposit commission
  // even though it was paid as draw offset, leaving only $5,000 remaining.
  assert.equal(calculateFinalTrueUp(10_000, 5_000), 5_000);
  assert.equal(10_000 - 5_000, 5_000);
});

test("previouslyRecognizedCommission excludes draw/rollover offsets by design", () => {
  const events = [
    { eventType: "deposit" as const, status: "paid", netPayable: 0 },
  ];

  assert.equal(previouslyRecognizedCommission(events), 0);
});
