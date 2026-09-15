"use client";

import { useActionState, useState } from "react";

import {
  SERVICE_ROLE_UNAVAILABLE_MESSAGE,
  SERVICE_ROLE_UNAVAILABLE_TITLE,
} from "@/lib/admin/user-messages";
import type { UserDirectoryRow } from "@/lib/admin/user-directory";
import {
  ACCOUNT_PROVISIONING_MODES,
  PASSWORD_MIN_LENGTH,
  type AccountProvisioningMode,
} from "@/lib/admin/user-validation";
import {
  createPortalUser,
  linkExistingPortalUser,
  updatePortalUser,
} from "@/lib/admin/user-actions";
import {
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { AlertIcon, InfoIcon } from "@/components/icons";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions/roles";

export type ManagerOption = { id: string; name: string };

/** A department or business role the account can be assigned to. */
export type AssignmentOption = { id: string; name: string };

const MODE_LABELS: Record<AccountProvisioningMode, string> = {
  invite: "Invite by email (recommended for employees)",
  password: "Create with a password (test accounts)",
};

function RoleSelect({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue?: Role;
  error?: string;
}) {
  return (
    <Field
      label="Role"
      htmlFor={id}
      hint="Roles decide what the portal lets someone do. Compensation comes from the plan assignment, not the role."
      error={error}
    >
      <Select id={id} name="role" defaultValue={defaultValue ?? "employee"} required>
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ManagerSelect({
  id,
  managers,
  defaultValue,
  error,
}: {
  id: string;
  managers: ManagerOption[];
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <Field
      label="Manager"
      htmlFor={id}
      hint="Used for supervisor visibility and, later, manager attribution. Optional."
      error={error}
    >
      <Select id={id} name="managerId" defaultValue={defaultValue ?? ""}>
        <option value="">No manager</option>
        {managers.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Primary department.
 *
 * The registry list, not free text: the department is now a row with a slug, a
 * description and an owner, and the legacy free-text column is kept in step by the
 * database. When the Phase 5 migration has not been applied, the list is empty and
 * the control says so instead of pretending to save.
 */
function DepartmentSelect({
  id,
  departments,
  defaultValue,
  error,
}: {
  id: string;
  departments: AssignmentOption[];
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <Field
      label="Department"
      htmlFor={id}
      hint="Where this person belongs. Separate from their business role, which decides their app experience."
      error={error}
    >
      <Select
        id={id}
        name="departmentId"
        defaultValue={defaultValue ?? ""}
        disabled={departments.length === 0}
      >
        <option value="">No department assigned</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Primary business role.
 *
 * This is what shapes the person's modules, dashboard and quick actions. It is
 * deliberately next to the security role so the two are configured together and
 * their difference is obvious.
 */
function BusinessRoleSelect({
  id,
  businessRoles,
  defaultValue,
  error,
}: {
  id: string;
  businessRoles: AssignmentOption[];
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <Field
      label="Business role"
      htmlFor={id}
      hint="Their role experience: modules, dashboard widgets and quick actions. Never a permission — the security role above still decides what they may do."
      error={error}
    >
      <Select
        id={id}
        name="businessRoleId"
        defaultValue={defaultValue ?? ""}
        disabled={businessRoles.length === 0}
      >
        <option value="">No business role assigned (fallback experience)</option>
        {businessRoles.map((businessRole) => (
          <option key={businessRole.id} value={businessRole.id}>
            {businessRole.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function assignmentHint(departments: AssignmentOption[], businessRoles: AssignmentOption[]) {
  if (departments.length > 0 && businessRoles.length > 0) return null;

  return "Department and business-role assignment need the Phase 5 migration (supabase/migrations/20260915230000_business_architecture.sql). Until then each account falls back to its security role.";
}

// ---------------------------------------------------------------------------
// Creating a portal account
// ---------------------------------------------------------------------------

export function CreatePortalUserForm({
  managers,
  departments,
  businessRoles,
  canProvision,
}: {
  managers: ManagerOption[];
  departments: AssignmentOption[];
  businessRoles: AssignmentOption[];
  canProvision: boolean;
}) {
  const [mode, setMode] = useState<AccountProvisioningMode>("invite");
  const [state, formAction] = useActionState(createPortalUser, undefined);

  if (!canProvision) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-4">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">{SERVICE_ROLE_UNAVAILABLE_TITLE}</p>
          <p className="text-sm leading-6 text-ink-muted">{SERVICE_ROLE_UNAVAILABLE_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Email address"
          htmlFor="create-user-email"
          error={fieldError(state, "email")}
        >
          <TextInput
            id="create-user-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="designer@cabinetgenies.com"
            required
          />
        </Field>
        <Field
          label="How to create the account"
          htmlFor="create-user-mode"
          error={fieldError(state, "mode")}
        >
          <Select
            id="create-user-mode"
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as AccountProvisioningMode)}
          >
            {ACCOUNT_PROVISIONING_MODES.map((value) => (
              <option key={value} value={value}>
                {MODE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="First name"
          htmlFor="create-user-first"
          error={fieldError(state, "firstName")}
        >
          <TextInput id="create-user-first" name="firstName" autoComplete="off" />
        </Field>
        <Field
          label="Last name"
          htmlFor="create-user-last"
          error={fieldError(state, "lastName")}
        >
          <TextInput id="create-user-last" name="lastName" autoComplete="off" />
        </Field>
        <Field
          label="Display name"
          htmlFor="create-user-display"
          hint="Blank falls back to the name, then the email address."
          error={fieldError(state, "displayName")}
        >
          <TextInput id="create-user-display" name="displayName" autoComplete="off" />
        </Field>
        <DepartmentSelect
          id="create-user-department"
          departments={departments}
          error={fieldError(state, "departmentId")}
        />
        <BusinessRoleSelect
          id="create-user-business-role"
          businessRoles={businessRoles}
          error={fieldError(state, "businessRoleId")}
        />
        <RoleSelect id="create-user-role" error={fieldError(state, "role")} />
        <ManagerSelect id="create-user-manager" managers={managers} error={fieldError(state, "managerId")} />
        {mode === "password" ? (
          <Field
            label="Password"
            htmlFor="create-user-password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. Supabase stores the hash; the portal never keeps it.`}
            error={fieldError(state, "password")}
          >
            <TextInput
              id="create-user-password"
              name="password"
              type="password"
              autoComplete="new-password"
            />
          </Field>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-subtle">
        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Inviting sends a Supabase email so the person sets their own password. Creating
          with a password is the quickest way to stand up a test Sales Designer for the
          commission workflow.
        </span>
      </p>

      {assignmentHint(departments, businessRoles) ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-xs leading-5 text-ink-muted">
          {assignmentHint(departments, businessRoles)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          label={mode === "invite" ? "Invite portal user" : "Create portal user"}
          pendingLabel={mode === "invite" ? "Inviting…" : "Creating…"}
          size="sm"
        />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Linking an existing Supabase Auth user
// ---------------------------------------------------------------------------

export function LinkExistingPortalUserForm({
  managers,
  departments,
  businessRoles,
}: {
  managers: ManagerOption[];
  departments: AssignmentOption[];
  businessRoles: AssignmentOption[];
}) {
  const [state, formAction] = useActionState(linkExistingPortalUser, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Supabase Auth user id"
          htmlFor="link-user-id"
          hint="Supabase → Authentication → Users → copy the id (UUID)."
          error={fieldError(state, "authUserId")}
        >
          <TextInput
            id="link-user-id"
            name="authUserId"
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
            required
          />
        </Field>
        <Field
          label="Email address"
          htmlFor="link-user-email"
          error={fieldError(state, "email")}
        >
          <TextInput
            id="link-user-email"
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="First name" htmlFor="link-user-first" error={fieldError(state, "firstName")}>
          <TextInput id="link-user-first" name="firstName" autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="link-user-last" error={fieldError(state, "lastName")}>
          <TextInput id="link-user-last" name="lastName" autoComplete="off" />
        </Field>
        <Field
          label="Display name"
          htmlFor="link-user-display"
          error={fieldError(state, "displayName")}
        >
          <TextInput id="link-user-display" name="displayName" autoComplete="off" />
        </Field>
        <DepartmentSelect
          id="link-user-department"
          departments={departments}
          error={fieldError(state, "departmentId")}
        />
        <BusinessRoleSelect
          id="link-user-business-role"
          businessRoles={businessRoles}
          error={fieldError(state, "businessRoleId")}
        />
        <RoleSelect id="link-user-role" defaultValue="employee" error={fieldError(state, "role")} />
        <ManagerSelect id="link-user-manager" managers={managers} error={fieldError(state, "managerId")} />
      </div>

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-subtle">
        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Linking creates the portal profile row for an account that already exists in
          Supabase Auth. It cannot create the Auth user, and it refuses an id that is not
          a real Auth user.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Link existing user" pendingLabel="Linking…" size="sm" variant="secondary" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Editing a portal user
// ---------------------------------------------------------------------------

export function UpdatePortalUserForm({
  user,
  managers,
  departments,
  businessRoles,
}: {
  user: UserDirectoryRow;
  managers: ManagerOption[];
  departments: AssignmentOption[];
  businessRoles: AssignmentOption[];
}) {
  const [state, formAction] = useActionState(updatePortalUser, undefined);
  const id = (field: string) => `user-${user.profileId}-${field}`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="profileId" value={user.profileId} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="First name" htmlFor={id("first")} error={fieldError(state, "firstName")}>
          <TextInput
            id={id("first")}
            name="firstName"
            defaultValue={user.firstName ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field label="Last name" htmlFor={id("last")} error={fieldError(state, "lastName")}>
          <TextInput
            id={id("last")}
            name="lastName"
            defaultValue={user.lastName ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Display name"
          htmlFor={id("display")}
          hint="Overrides the name shown across the portal when set."
          error={fieldError(state, "displayName")}
        >
          <TextInput
            id={id("display")}
            name="displayName"
            defaultValue={user.displayName ?? ""}
            autoComplete="off"
          />
        </Field>
        <DepartmentSelect
          id={id("department")}
          departments={departments}
          defaultValue={user.departmentId}
          error={fieldError(state, "departmentId")}
        />
        <BusinessRoleSelect
          id={id("business-role")}
          businessRoles={businessRoles}
          defaultValue={user.businessRoleId}
          error={fieldError(state, "businessRoleId")}
        />
        <RoleSelect id={id("role")} defaultValue={user.role} error={fieldError(state, "role")} />
        <ManagerSelect
          id={id("manager")}
          managers={managers}
          defaultValue={user.managerId}
          error={fieldError(state, "managerId")}
        />
        <Field
          label="Status"
          htmlFor={id("active")}
          hint="Deactivating keeps the profile and its history; it removes portal access."
          error={fieldError(state, "active")}
        >
          <Select id={id("active")} name="active" defaultValue={user.active ? "true" : "false"}>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </Select>
        </Field>
      </div>

      {assignmentHint(departments, businessRoles) ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-xs leading-5 text-ink-muted">
          {assignmentHint(departments, businessRoles)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save user" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
