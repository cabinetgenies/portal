import assert from "node:assert/strict";
import test from "node:test";

import {
  accountStatusLabel,
  assignmentInForceAt,
  buildUserDirectoryRows,
  describeAuditEntry,
  drawStatusLabel,
  type UserDirectorySources,
} from "@/lib/admin/user-directory";
import type {
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  EmployeeDrawPeriodRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

const TODAY = "2026-09-15";

function profile(overrides: Partial<ProfileRow> & { id: string }): ProfileRow {
  return {
    email: `${overrides.id}@cabinetgenies.com`,
    first_name: null,
    last_name: null,
    display_name: null,
    role: "employee",
    department: null,
    department_id: null,
    business_role_id: null,
    manager_id: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function settings(
  overrides: Partial<EmployeeCompensationSettingsRow> & { profile_id: string },
): EmployeeCompensationSettingsRow {
  return {
    id: `settings-${overrides.profile_id}`,
    compensation_eligible: false,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assignment(
  overrides: Partial<EmployeeCompensationAssignmentRow> & {
    profile_id: string;
    compensation_plan_id: string;
    effective_from: string;
  },
): EmployeeCompensationAssignmentRow {
  return {
    id: `assignment-${overrides.profile_id}-${overrides.effective_from}`,
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function drawPeriod(
  overrides: Partial<EmployeeDrawPeriodRow> & {
    profile_id: string;
    effective_from: string;
  },
): EmployeeDrawPeriodRow {
  return {
    id: `draw-${overrides.profile_id}-${overrides.effective_from}`,
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function sources(overrides: Partial<UserDirectorySources> = {}): UserDirectorySources {
  return {
    profiles: [],
    departments: [],
    businessRoles: [],
    compensationSettings: [],
    assignments: [],
    plans: [],
    drawPeriods: [],
    today: TODAY,
    ...overrides,
  };
}

test("a directory row combines the profile, plan and draw state", () => {
  const manager = profile({ id: "manager", first_name: "Mia", last_name: "Reyes" });
  const designer = profile({
    id: "designer",
    first_name: "Dana",
    last_name: "Reed",
    role: "employee",
    department: "Sales",
    manager_id: "manager",
  });

  const rows = buildUserDirectoryRows(
    sources({
      profiles: [designer, manager],
      compensationSettings: [settings({ profile_id: "designer", compensation_eligible: true })],
      assignments: [
        assignment({
          profile_id: "designer",
          compensation_plan_id: "plan-standard",
          effective_from: "2026-01-01",
        }),
      ],
      plans: [
        {
          id: "plan-standard",
          name: "Cabinet Genies Standard GP Commission",
          participant_kind: "sales_designer",
        },
      ],
      drawPeriods: [
        drawPeriod({ profile_id: "designer", effective_from: "2026-09-01" }),
      ],
    }),
  );

  const row = rows.find((candidate) => candidate.profileId === "designer");

  assert.ok(row);
  assert.equal(row.name, "Dana Reed");
  assert.equal(row.firstName, "Dana");
  assert.equal(row.managerName, "Mia Reyes");
  assert.equal(row.compensationEligible, true);
  assert.equal(row.planName, "Cabinet Genies Standard GP Commission");
  assert.equal(row.planParticipantKind, "sales_designer");
  assert.equal(row.assignmentEffectiveFrom, "2026-01-01");
  assert.equal(row.onDraw, true);
  assert.equal(row.openDrawPeriodFrom, "2026-09-01");
  assert.equal(row.statusLabel, "Active");
});

test("manager, plan and draw state are absent when nothing is configured", () => {
  const rows = buildUserDirectoryRows(
    sources({
      profiles: [
        profile({ id: "new", first_name: "Sam", manager_id: "missing-profile" }),
      ],
    }),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].managerName, null);
  assert.equal(rows[0].planName, null);
  assert.equal(rows[0].compensationEligible, false);
  assert.equal(rows[0].onDraw, false);
  assert.equal(rows[0].openDrawPeriodFrom, null);
  assert.equal(rows[0].assignmentEffectiveFrom, null);
});

test("assignments only count while they are in force", () => {
  const future = assignment({
    profile_id: "designer",
    compensation_plan_id: "plan-standard",
    effective_from: "2026-10-01",
  });
  const ended = assignment({
    profile_id: "designer",
    compensation_plan_id: "plan-standard",
    effective_from: "2026-01-01",
    effective_to: "2026-08-31",
  });
  const covering = assignment({
    profile_id: "designer",
    compensation_plan_id: "plan-standard",
    effective_from: "2026-01-01",
    effective_to: TODAY,
  });

  assert.equal(assignmentInForceAt([future], "designer", TODAY), undefined);
  assert.equal(assignmentInForceAt([ended], "designer", TODAY), undefined);
  assert.equal(assignmentInForceAt([covering], "designer", TODAY)?.id, covering.id);
  assert.equal(
    assignmentInForceAt([covering], "someone-else", TODAY),
    undefined,
    "another employee's assignment must never be treated as this one's",
  );
});

test("active accounts are listed first, then alphabetically", () => {
  const rows = buildUserDirectoryRows(
    sources({
      profiles: [
        profile({ id: "zoe", first_name: "Zoe", active: false }),
        profile({ id: "adam", first_name: "Adam" }),
        profile({ id: "bea", first_name: "Bea" }),
      ],
    }),
  );

  assert.deepEqual(
    rows.map((row) => row.name),
    ["Adam", "Bea", "Zoe"],
  );
});

test("the directory shows the business role beside the security role", () => {
  const rows = buildUserDirectoryRows(
    sources({
      profiles: [
        profile({
          id: "designer",
          first_name: "Dana",
          role: "employee",
          business_role_id: "role-sales-designer",
          department_id: "dept-sales",
          department: "Sales",
        }),
        profile({ id: "unassigned", first_name: "Sam", role: "employee" }),
      ],
      departments: [{ id: "dept-sales", name: "Sales", slug: "sales" }],
      businessRoles: [{ id: "role-sales-designer", name: "Sales Designer", key: "sales_designer" }],
    }),
  );

  const designer = rows.find((row) => row.profileId === "designer");
  const unassigned = rows.find((row) => row.profileId === "unassigned");

  assert.equal(designer?.role, "employee");
  assert.equal(designer?.businessRoleName, "Sales Designer");
  assert.equal(designer?.businessRoleKey, "sales_designer");
  assert.equal(designer?.departmentId, "dept-sales");
  assert.equal(designer?.departmentName, "Sales");

  // No business role is a normal state while assignment is rolled out: the shell
  // falls back to the security role and says so.
  assert.equal(unassigned?.businessRoleName, null);
  assert.equal(unassigned?.departmentName, null);
});

test("a legacy free-text department still displays when no registry department is assigned", () => {
  const rows = buildUserDirectoryRows(
    sources({
      profiles: [profile({ id: "legacy", first_name: "Lee", department: "Sales" })],
    }),
  );

  assert.equal(rows[0].departmentId, null);
  assert.equal(rows[0].departmentName, "Sales");
});

test("status and draw labels read as sentences", () => {
  assert.equal(accountStatusLabel(true), "Active");
  assert.equal(accountStatusLabel(false), "Deactivated");
  assert.equal(drawStatusLabel({ onDraw: false, openDrawPeriodFrom: null }), "Standard rate");
  assert.equal(
    drawStatusLabel({ onDraw: true, openDrawPeriodFrom: "2026-09-01" }),
    "On draw",
  );
  assert.equal(drawStatusLabel({ onDraw: true, openDrawPeriodFrom: null }), "On draw");
});

test("audit metadata is summarised instead of dumped", () => {
  assert.equal(
    describeAuditEntry({ role: { from: "employee", to: "accounting" } }),
    "Role: employee → accounting",
  );
  assert.equal(
    describeAuditEntry({ active: { from: true, to: false } }),
    "Active: yes → no",
  );
  assert.equal(describeAuditEntry({ department: { from: null, to: "Sales" } }), "Department: — → Sales");

  const many = describeAuditEntry({
    a: { from: 1, to: 2 },
    b: { from: 1, to: 2 },
    c: { from: 1, to: 2 },
    d: { from: 1, to: 2 },
  });

  assert.match(String(many), /\+1 more$/);
  assert.equal(describeAuditEntry({}), null);
  assert.equal(describeAuditEntry({ after: { role: "employee" } }), null);
  assert.equal(describeAuditEntry(null), null);
  assert.equal(describeAuditEntry([1, 2, 3]), null);
});
