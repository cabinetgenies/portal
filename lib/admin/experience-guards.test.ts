import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { can } from "@/lib/permissions/roles";
import { CONFIGURATION_CAPABILITY, isExperienceKind } from "@/lib/experience/kinds";

/**
 * Architecture guards.
 *
 * Some of the properties this phase promises can only be checked against the files
 * themselves: that the configuration tables are administrator-only in Postgres,
 * that the admin area is capability-gated, that the role preview cannot touch a
 * session, and that nothing in the new layer reaches into the commission engine.
 * These tests read the source and fail loudly if one of those promises is quietly
 * dropped later.
 */

const ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

/** Whitespace-insensitive view of a SQL file, so formatting never breaks a guard. */
function squash(sql: string) {
  return sql.replace(/\s+/g, " ");
}

test("unauthorized configuration changes are blocked", () => {
  // In code: editing an experience requires administer:portal, which only admin
  // and CEO hold.
  assert.equal(CONFIGURATION_CAPABILITY, "administer:portal");

  for (const role of ["employee", "supervisor", "accounting"] as const) {
    assert.equal(can(role, CONFIGURATION_CAPABILITY), false, `${role} must not configure`);
  }

  for (const role of ["admin", "ceo"] as const) {
    assert.equal(can(role, CONFIGURATION_CAPABILITY), true, `${role} may configure`);
  }
});

test("every experience configuration table is administrator-only in Postgres", () => {
  const sql = squash(read("supabase/migrations/20260915230100_business_architecture_rls.sql"));

  const administratorManaged = [
    "departments",
    "business_roles",
    "app_modules",
    "role_modules",
    "dashboard_widgets",
    "role_dashboard_widgets",
    "quick_actions",
    "role_quick_actions",
    "knowledge_items",
    "knowledge_item_roles",
  ];

  for (const table of administratorManaged) {
    const policy = new RegExp(
      `create policy "[^"]+" on public\\.${table} for all to authenticated using \\(public\\.current_profile_role_is\\('admin', 'ceo'\\)\\) with check \\(public\\.current_profile_role_is\\('admin', 'ceo'\\)\\)`,
    );

    assert.match(
      sql,
      policy,
      `${table} must only be writable by admin and CEO, enforced by RLS`,
    );
    assert.ok(
      sql.includes(`revoke all on table public.${table} from anon`),
      `${table} must not be readable by anonymous requests`,
    );
    assert.ok(
      sql.includes(`alter table public.${table} enable row level security`),
      `${table} must have RLS enabled`,
    );
  }
});

test("the configuration migration is additive: it never truncates or deletes", () => {
  const files = [
    "supabase/migrations/20260915230000_business_architecture.sql",
    "supabase/migrations/20260915230100_business_architecture_rls.sql",
    "supabase/migrations/20260915230200_seed_business_architecture.sql",
  ];

  for (const file of files) {
    const sql = squash(read(file)).toLowerCase();

    // Prose in the migration comments says "never truncated"; the guard is about
    // the SQL statement itself.
    assert.equal(/\btruncate\s+(table\s+)?[a-z_]/.test(sql), false, `${file} must not truncate`);
    assert.equal(/\bdelete from\b/.test(sql), false, `${file} must not delete rows`);
    assert.equal(/\bdrop table\b/.test(sql), false, `${file} must not drop a table`);
    assert.equal(/\bdrop column\b/.test(sql), false, `${file} must not drop a column`);
  }
});

test("department and business-role assignment are privileged profile changes", () => {
  const sql = squash(read("supabase/migrations/20260915230000_business_architecture.sql"));

  assert.ok(
    sql.includes("new.department_id is distinct from old.department_id"),
    "a non-administrator must not be able to reassign their own department",
  );
  assert.ok(
    sql.includes("new.business_role_id is distinct from old.business_role_id"),
    "a non-administrator must not be able to rewrite their own role experience",
  );
  assert.ok(
    sql.includes("'business_role_changed'") && sql.includes("'department_assignment_changed'"),
    "assignment changes must join the existing audit trail",
  );
});

test("the admin area and the role preview are capability-gated server-side", () => {
  const adminLayout = read("app/(app)/admin/layout.tsx");
  assert.ok(
    adminLayout.includes('requireCapability("administer:portal")'),
    "the admin layout must gate the whole area",
  );

  const previewPage = read("app/(app)/admin/role-experiences/page.tsx");
  assert.ok(
    previewPage.includes('requireCapability("administer:portal")'),
    "the role preview is Admin/CEO only",
  );
  assert.ok(
    previewPage.includes("Role preview — read only"),
    "the preview must say that it is read-only",
  );
});

test("the role preview does not alter the auth session", () => {
  const files = [
    "app/(app)/admin/role-experiences/page.tsx",
    "lib/experience/queries.ts",
    "lib/experience/resolve.ts",
  ];

  const forbidden = [
    "signInWithPassword",
    "signInWithOtp",
    "setSession",
    "refreshSession",
    "signOut",
    "admin.auth",
    // The word appears in the pages' own prose ("This is NOT impersonation"), so
    // the guard looks for the call, not the noun.
    "impersonate(",
    ".impersonate",
  ];

  for (const file of files) {
    const source = read(file);

    for (const pattern of forbidden) {
      assert.equal(
        source.includes(pattern),
        false,
        `${file} must not reference ${pattern}: the preview is not impersonation`,
      );
    }
  }
});

test("hidden modules cannot bypass server authorization", () => {
  // Visibility is presentation; the module's capability requirement lives in code
  // and the routes keep their own checks. Both halves are asserted here.
  const requirements = read("lib/permissions/module-capabilities.ts");

  assert.ok(
    requirements.includes('admin: ["administer:portal"]'),
    "the admin module must carry a code-level capability requirement",
  );
  assert.ok(
    requirements.includes('"view:own-commission"'),
    "the commissions module must be reachable through a real capability, not visibility",
  );

  const commissionPages = [
    "app/(app)/admin/users/page.tsx",
    "app/(app)/admin/commission-settings/page.tsx",
    "app/(app)/admin/compensation-plans/page.tsx",
  ];

  for (const page of commissionPages) {
    assert.ok(
      read(page).includes("requireCapability"),
      `${page} must re-check authorization rather than trusting navigation`,
    );
  }
});

test("the commission and compensation domains stay independent of the experience layer", () => {
  // Phase 5 must not be able to change commission math. The strongest static
  // expression of that is that the calculation domain does not import the new
  // architecture at all.
  const domains = ["lib/commission", "lib/compensation"];

  for (const domain of domains) {
    const directory = path.join(ROOT, domain);

    for (const file of readDirectory(directory)) {
      if (!file.endsWith(".ts")) continue;

      const source = readFileSync(file, "utf8");
      const relative = path.relative(ROOT, file).replaceAll("\\", "/");

      for (const forbidden of ["@/lib/experience", "@/lib/knowledge"]) {
        assert.equal(
          source.includes(forbidden),
          false,
          `${relative} must not depend on ${forbidden}`,
        );
      }
    }
  }
});

test("the experience kinds are the three configurable slices", () => {
  assert.equal(isExperienceKind("module"), true);
  assert.equal(isExperienceKind("widget"), true);
  assert.equal(isExperienceKind("action"), true);
  assert.equal(isExperienceKind("dashboard"), false);
});

/** Every .ts/.tsx file below a directory, recursively. */
function readDirectory(directory: string): string[] {
  const entries = readdirSafe(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...readDirectory(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function readdirSafe(directory: string) {
  return readdirSync(directory, { withFileTypes: true });
}
