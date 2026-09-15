import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommissionPipeline,
  designerStatusLabel,
  designerStatusTone,
  drawLedgerRows,
  drawSchedule,
  drawScheduleStatusLabel,
  drawTotals,
  filterCommissionEvents,
  rolloverLedgerRows,
  toPipelineItems,
} from "@/lib/commission/designer-dashboard";
import type { EmployeeCommissionSummary } from "@/lib/commission/event-queries";
import type {
  CommissionEventRow,
  CommissionRolloverLedgerRow,
  EmployeeDrawLedgerRow,
  EmployeeDrawPeriodRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

/**
 * Phase 4.2: the designer dashboard is a pure transform of already-loaded rows.
 *
 * These tests cover the composition rules the pages depend on: how the draw schedule
 * reads, how ledger balances are shown, how the pipeline is grouped, and the
 * employee-facing status language.
 */

const TODAY = "2026-09-15";

function profile(id = "designer-1"): ProfileRow {
  return {
    id,
    email: "designer@cabinetgenies.com",
    first_name: "Dana",
    last_name: "Reed",
    display_name: null,
    role: "employee",
    department: "Sales",
    manager_id: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function job(overrides: Partial<JobRow> & { id: string }): JobRow {
  return {
    job_number: null,
    job_name: `Job ${overrides.id}`,
    customer_name: null,
    project_category_id: null,
    status: "active",
    sales_designer_id: "designer-1",
    sold_date: "2026-08-01",
    deposit_received_date: null,
    completion_date: null,
    gp_audit_completed_date: null,
    contract_revenue: 100_000,
    change_order_revenue: 0,
    credit_amount: 0,
    other_revenue: 0,
    material_cost: 0,
    labor_cost: 0,
    subcontractor_cost: 0,
    other_direct_cost: 0,
    original_cost: 50_000,
    change_order_cost: 0,
    burden_cost: 0,
    warranty_service_contingency: 0,
    actual_total_revenue: 100_000,
    actual_total_cost: 50_000,
    job_gross_profit: 50_000,
    job_gp_percent: 0.5,
    commissionable_revenue: 100_000,
    commissionable_cost: 50_000,
    commissionable_gross_profit: 50_000,
    commissionable_gp_percent: 0.5,
    burden_percent: 0,
    warranty_contingency_percent: 0,
    compensation_plan_id: null,
    compensation_plan_version_id: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function event(overrides: Partial<CommissionEventRow> & { id: string }): CommissionEventRow {
  return {
    job_id: "job-1",
    profile_id: "designer-1",
    event_type: "deposit",
    calculation_stage: "projected",
    compensation_plan_id: "plan-1",
    compensation_plan_version_id: "version-2",
    commissionable_gp: 50_000,
    commissionable_gp_percent: 0.478,
    tier_label: "47% to under 49% GP",
    standard_commission_rate: 0.25,
    draw_rate_reduction: 0,
    effective_commission_rate: 0.25,
    job_gross_commission: 11_950,
    deposit_payout_percent: 0.5,
    gross_commission: 5_975,
    previously_recognized: 0,
    rollover_offset: 0,
    draw_offset: 0,
    net_payable: 5_975,
    status: "calculated",
    void_reason: null,
    voided_by: null,
    voided_at: null,
    calculation_metadata: {},
    created_by: null,
    approved_by: null,
    approved_at: null,
    paid_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<EmployeeCommissionSummary> = {}): EmployeeCommissionSummary {
  return {
    profile: profile(),
    compensationEligible: true,
    compensationNotes: null,
    planName: "Cabinet Genies Standard GP Commission",
    assignmentEffectiveFrom: "2026-01-01",
    drawRateReduction: 0.05,
    onDraw: false,
    openDrawPeriodFrom: null,
    drawBalance: 0,
    rolloverBalance: 0,
    projectedCommission: 0,
    pendingApproval: 0,
    approvedUnpaid: 0,
    paidYtd: 0,
    events: [],
    drawPeriods: [],
    drawLedger: [],
    rolloverLedger: [],
    ...overrides,
  };
}

function drawPeriod(
  overrides: Partial<EmployeeDrawPeriodRow> & { id: string; effective_from: string },
): EmployeeDrawPeriodRow {
  return {
    profile_id: "designer-1",
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function drawEntry(
  overrides: Partial<EmployeeDrawLedgerRow> & { id: string; amount: number; created_at: string },
): EmployeeDrawLedgerRow {
  return {
    profile_id: "designer-1",
    transaction_type: "draw_advance",
    job_id: null,
    commission_event_id: null,
    reason: "Monthly advance",
    created_by: null,
    ...overrides,
  };
}

function rolloverEntry(
  overrides: Partial<CommissionRolloverLedgerRow> & {
    id: string;
    amount: number;
    created_at: string;
  },
): CommissionRolloverLedgerRow {
  return {
    profile_id: "designer-1",
    job_id: null,
    commission_event_id: null,
    transaction_type: "negative_true_up",
    reason: "Negative true-up",
    created_by: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

test("the draw schedule reads from effective-dated periods, newest first", () => {
  const schedule = drawSchedule(
    [
      drawPeriod({ id: "old", effective_from: "2026-01-01", effective_to: "2026-06-30" }),
      drawPeriod({ id: "current", effective_from: "2026-09-15" }),
      drawPeriod({ id: "future", effective_from: "2026-11-01" }),
    ],
    0.05,
    TODAY,
  );

  assert.deepEqual(
    schedule.map((row) => [row.id, row.status]),
    [
      ["future", "scheduled"],
      ["current", "active"],
      ["old", "ended"],
    ],
  );
  assert.equal(schedule[0].rateReductionPoints, 5);
  assert.equal(drawScheduleStatusLabel("active"), "On draw");
  assert.equal(drawScheduleStatusLabel("ended"), "Ended");
});

test("draw money is grouped the way an employee reads it", () => {
  const totals = drawTotals([
    drawEntry({ id: "a1", amount: 2_500, created_at: "2026-08-01T00:00:00Z" }),
    drawEntry({ id: "a2", amount: 2_500, created_at: "2026-09-01T00:00:00Z" }),
    drawEntry({
      id: "off1",
      amount: -1_200,
      transaction_type: "commission_offset",
      created_at: "2026-09-10T00:00:00Z",
    }),
    drawEntry({
      id: "rep1",
      amount: -300,
      transaction_type: "repayment",
      created_at: "2026-09-12T00:00:00Z",
    }),
  ]);

  assert.equal(totals.advances, 5_000);
  assert.equal(totals.commissionOffsets, -1_200);
  assert.equal(totals.repaymentsAndAdjustments, -300);
  assert.equal(totals.balance, 3_500);
});

test("the draw ledger shows the balance after each entry, newest first", () => {
  const rows = drawLedgerRows(
    [
      drawEntry({ id: "a1", amount: 2_500, created_at: "2026-08-01T00:00:00Z" }),
      drawEntry({
        id: "off1",
        amount: -1_000,
        transaction_type: "commission_offset",
        job_id: "job-1",
        created_at: "2026-09-10T00:00:00Z",
      }),
    ],
    new Map([["job-1", "Reed kitchen"]]),
  );

  assert.deepEqual(
    rows.map((row) => row.id),
    ["off1", "a1"],
    "newest first for display",
  );
  assert.equal(rows[0].balanceAfter, 1_500, "balance after the offset, chronologically");
  assert.equal(rows[1].balanceAfter, 2_500);
  assert.equal(rows[0].jobName, "Reed kitchen");
  assert.equal(rows[0].typeLabel, "commission offset");
});

test("the rollover ledger carries its own running balance", () => {
  const rows = rolloverLedgerRows(
    [
      rolloverEntry({ id: "r1", amount: 2_000, created_at: "2026-08-01T00:00:00Z" }),
      rolloverEntry({
        id: "r2",
        amount: -500,
        transaction_type: "future_commission_offset",
        created_at: "2026-09-01T00:00:00Z",
      }),
    ],
    new Map(),
  );

  assert.equal(rows[0].balanceAfter, 1_500);
  assert.equal(rows[1].balanceAfter, 2_000);
  assert.equal(rows[0].typeLabel, "future commission offset");
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

test("events are grouped into the four pipeline stages plus final true-ups", () => {
  const pipeline = buildCommissionPipeline({
    summary: summary({
      events: [
        event({ id: "e1", status: "calculated", created_at: "2026-09-01T00:00:00Z" }),
        event({ id: "e2", status: "pending_approval", created_at: "2026-09-02T00:00:00Z" }),
        event({ id: "e3", status: "approved", created_at: "2026-09-03T00:00:00Z" }),
        event({ id: "e4", status: "paid", created_at: "2026-09-04T00:00:00Z" }),
        event({
          id: "e5",
          event_type: "final_true_up",
          calculation_stage: "final",
          status: "pending_approval",
          created_at: "2026-09-05T00:00:00Z",
        }),
      ],
    }),
    jobs: [job({ id: "job-1" })],
    projections: new Map([["job-1", { grossCommission: 11_950, depositTarget: 5_975 }]]),
    auditStates: new Map([["job-1", "finalized"]]),
  });

  assert.deepEqual(pipeline.pendingApproval.map((item) => item.id), ["e2", "e5"]);
  assert.deepEqual(pipeline.readyToPay.map((item) => item.id), ["e3"]);
  assert.deepEqual(pipeline.paid.map((item) => item.id), ["e4"]);
  assert.deepEqual(pipeline.finalTrueUps.map((item) => item.id), ["e5"]);
  assert.equal(pipeline.active.length, 1);
  assert.equal(pipeline.active[0].auditState, "finalized");
});

test("active jobs carry the projection, what is paid, and what remains", () => {
  const pipeline = buildCommissionPipeline({
    summary: summary({
      events: [
        event({ id: "paid-1", status: "paid", net_payable: 5_975, paid_at: "2026-09-10T00:00:00Z" }),
        event({ id: "void-1", status: "voided", net_payable: 999 }),
      ],
    }),
    jobs: [job({ id: "job-1", deposit_received_date: "2026-09-09" })],
    projections: new Map([["job-1", { grossCommission: 11_950, depositTarget: 5_975 }]]),
    auditStates: new Map([["job-1", "not_started"]]),
  });

  const row = pipeline.active[0];

  assert.equal(row.depositReceived, true);
  assert.equal(row.projectedGrossCommission, 11_950);
  assert.equal(row.depositTarget, 5_975);
  assert.equal(row.commissionPaidToDate, 5_975);
  // Remaining = projection − what has been recognized, ignoring the voided event.
  assert.equal(row.estimatedRemaining, 5_975);
});

test("a job with no plan version shows no projection rather than a fake zero", () => {
  const pipeline = buildCommissionPipeline({
    summary: summary(),
    jobs: [job({ id: "job-1" })],
    projections: new Map([["job-1", null]]),
    auditStates: new Map(),
  });

  assert.equal(pipeline.active[0].projectedGrossCommission, null);
  assert.equal(pipeline.active[0].depositTarget, null);
  assert.equal(pipeline.active[0].estimatedRemaining, null);
  assert.equal(pipeline.active[0].auditState, "not_started");
});

test("a cancelled job leaves the active list", () => {
  const pipeline = buildCommissionPipeline({
    summary: summary(),
    jobs: [job({ id: "job-1", status: "cancelled" })],
    projections: new Map(),
    auditStates: new Map(),
  });

  assert.deepEqual(pipeline.active, []);
});

test("empty states are genuinely empty", () => {
  const pipeline = buildCommissionPipeline({
    summary: summary(),
    jobs: [],
    projections: new Map(),
    auditStates: new Map(),
  });

  assert.deepEqual(pipeline.active, []);
  assert.deepEqual(pipeline.pendingApproval, []);
  assert.deepEqual(pipeline.readyToPay, []);
  assert.deepEqual(pipeline.paid, []);
  assert.deepEqual(pipeline.finalTrueUps, []);
});

// ---------------------------------------------------------------------------
// History filters and language
// ---------------------------------------------------------------------------

test("history filters select the right events", () => {
  const events = [
    event({ id: "deposit", event_type: "deposit", status: "paid", created_at: "2026-09-01T00:00:00Z" }),
    event({
      id: "true-up",
      event_type: "final_true_up",
      status: "pending_approval",
      created_at: "2026-09-02T00:00:00Z",
    }),
    event({
      id: "adjustment",
      event_type: "manual_adjustment",
      status: "approved",
      created_at: "2026-09-03T00:00:00Z",
    }),
    event({ id: "void", event_type: "manual_adjustment", status: "voided", created_at: "2026-09-04T00:00:00Z" }),
  ];

  assert.deepEqual(filterCommissionEvents(events, "all").map((e) => e.id), [
    "void",
    "adjustment",
    "true-up",
    "deposit",
  ]);
  assert.deepEqual(filterCommissionEvents(events, "deposit").map((e) => e.id), ["deposit"]);
  assert.deepEqual(filterCommissionEvents(events, "final_true_up").map((e) => e.id), ["true-up"]);
  assert.deepEqual(filterCommissionEvents(events, "manual_adjustment").map((e) => e.id), [
    "void",
    "adjustment",
  ]);
  assert.deepEqual(filterCommissionEvents(events, "paid").map((e) => e.id), ["deposit"]);
  assert.deepEqual(filterCommissionEvents(events, "voided").map((e) => e.id), ["void"]);
});

test("status language is written for the person, not for the database", () => {
  assert.equal(designerStatusLabel("calculated"), "Projected");
  assert.equal(designerStatusLabel("pending_approval"), "Pending approval");
  assert.equal(designerStatusLabel("approved"), "Ready to pay");
  assert.equal(designerStatusLabel("paid"), "Paid");
  assert.equal(designerStatusLabel("voided"), "Voided");
  assert.equal(designerStatusTone("approved"), "info");
  assert.equal(designerStatusTone("paid"), "positive");
  assert.equal(designerStatusTone("not_a_status"), "neutral");
});

test("recent activity uses the same item shape as the pipeline", () => {
  const items = toPipelineItems({
    events: [event({ id: "e1", status: "approved" })],
    jobs: [job({ id: "job-1", job_name: "Reed kitchen" })],
    auditStates: new Map(),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].jobName, "Reed kitchen");
  assert.equal(items[0].statusLabel, "Ready to pay");
  assert.equal(items[0].eventTypeLabel, "Deposit commission");
});
