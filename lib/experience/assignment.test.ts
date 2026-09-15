import assert from "node:assert/strict";
import test from "node:test";

import { assignmentSourceLabel, resolveAssignment } from "@/lib/experience/assignment";
import { registryExperienceCatalog } from "@/lib/experience/registry-catalog";
import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Employee assignment resolution.
 *
 * Department and business role are separate concepts, and both are optional while
 * assignment is rolled out, so the three outcomes (assigned, fallback, unassigned)
 * are each pinned here.
 */

const catalog = registryExperienceCatalog();

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "designer@cabinetgenies.com",
    first_name: "Dana",
    last_name: "Reed",
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

test("an employee resolves their primary business role", () => {
  const assignment = resolveAssignment({
    catalog,
    profile: profile({ business_role_id: "registry-role-sales_designer" }),
    authRole: "employee",
  });

  assert.equal(assignment.source, "assigned");
  assert.equal(assignment.businessRoleKey, "sales_designer");
  assert.equal(assignment.businessRoleName, "Sales Designer");
  assert.equal(assignment.businessRoleId, "registry-role-sales_designer");
});

test("an employee resolves their primary department", () => {
  const assignment = resolveAssignment({
    catalog,
    profile: profile({
      business_role_id: "registry-role-sales_designer",
      department_id: "registry-department-design",
    }),
    authRole: "employee",
  });

  // The assigned department wins over the role's default: an Office Manager
  // covering Sales keeps the Sales department and the Office Manager experience.
  assert.equal(assignment.departmentSlug, "design");
  assert.equal(assignment.departmentName, "Design");
});

test("a role's default department is used when none is assigned", () => {
  const assignment = resolveAssignment({
    catalog,
    profile: profile({ business_role_id: "registry-role-project_manager" }),
    authRole: "supervisor",
  });

  assert.equal(assignment.departmentSlug, "project-management");
  assert.equal(assignment.departmentName, "Project Management");
});

test("an unassigned profile falls back to its security role", () => {
  const admin = resolveAssignment({ catalog, profile: profile(), authRole: "admin" });
  assert.equal(admin.source, "auth_role_fallback");
  assert.equal(admin.businessRoleKey, "admin");

  const accounting = resolveAssignment({ catalog, profile: profile(), authRole: "accounting" });
  assert.equal(accounting.businessRoleKey, "bookkeeping");

  const supervisor = resolveAssignment({ catalog, profile: profile(), authRole: "supervisor" });
  assert.equal(supervisor.businessRoleKey, "project_manager");
});

test("an employee with no business role is explicit about being unassigned", () => {
  const assignment = resolveAssignment({ catalog, profile: profile(), authRole: "employee" });

  assert.equal(assignment.source, "unassigned");
  assert.equal(assignment.businessRoleKey, null);
  assert.equal(assignment.businessRoleName, null);
  assert.equal(
    assignmentSourceLabel(assignment.source),
    "No business role assigned — showing the baseline experience",
  );
});

test("a missing profile is handled the same way as an unassigned one", () => {
  const assignment = resolveAssignment({ catalog, profile: null, authRole: "employee" });

  assert.equal(assignment.source, "unassigned");
  assert.equal(assignment.departmentName, null);
});

test("the legacy free-text department is still readable when no registry department is set", () => {
  const assignment = resolveAssignment({
    catalog,
    profile: profile({ department: "Sales" }),
    authRole: "employee",
  });

  assert.equal(assignment.departmentName, "Sales");
  assert.equal(assignment.departmentSlug, null);
});
