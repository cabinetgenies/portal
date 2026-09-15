"use server";

import { revalidatePath } from "next/cache";

import {
  portalUserInviteSchema,
  portalUserLinkSchema,
  portalUserUpdateSchema,
} from "@/lib/admin/user-validation";
import { SERVICE_ROLE_UNAVAILABLE_MESSAGE, provisioningErrorMessage } from "@/lib/admin/user-messages";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  failureState,
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import type { Role } from "@/lib/permissions/roles";
import {
  ServiceRoleUnavailableError,
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * User-directory writes.
 *
 * Account creation goes through the Supabase Auth Admin API — auth.users rows are
 * never inserted with SQL, and no password material is stored in the portal
 * schema. That API needs the server-only service role key: when it is missing the
 * action refuses with an explanation instead of falling back to something weaker.
 *
 * Every action re-checks the `administer:portal` capability, which only admin and
 * CEO hold, and Postgres enforces the same rule again through Row Level Security
 * and the `profiles_protect_privileged_columns` trigger.
 */

function revalidateUserDirectory() {
  revalidatePath("/admin/users");
  revalidatePath("/sales/commissions/employees");
}

type DirectoryFields = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  role: Role;
  departmentId: string | null;
  businessRoleId: string | null;
  managerId: string | null;
};

/**
 * Applies the directory fields the sign-up trigger does not set.
 *
 * Creating an auth user fires `on_auth_user_created`, which inserts the profile
 * row with role `employee` and no access. Updating first keeps that insert (and
 * its audit row) and only ever falls back to an insert when the profile row is
 * genuinely missing — for example an auth user created before the profiles
 * migration existed.
 *
 * `active: true` is the approval. Nothing gets portal access by existing in
 * Supabase Auth — not a Google sign-in, not an account created in the dashboard —
 * so the one flow that is an administrator deliberately provisioning a colleague
 * is the one flow that grants it here, in a single audited step.
 */
async function applyDirectoryFields(
  profileId: string,
  fields: DirectoryFields,
): Promise<ActionState | null> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    email: fields.email,
    first_name: fields.firstName,
    last_name: fields.lastName,
    display_name: fields.displayName,
    role: fields.role,
    // The registry assignment is written, not the legacy text column: a database
    // trigger keeps `department` equal to the assigned department's name, so the
    // two can never disagree.
    department_id: fields.departmentId,
    business_role_id: fields.businessRoleId,
    manager_id: fields.managerId,
    active: true,
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select("id");

  if (error) {
    return mutationErrorState(error, "user");
  }

  if ((data ?? []).length === 0) {
    const insert = await supabase.from("profiles").insert({ id: profileId, ...payload });

    if (insert.error) {
      return mutationErrorState(insert.error, "user");
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Creating an account
// ---------------------------------------------------------------------------

export async function createPortalUser(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return auth.denied;

  const parsed = portalUserInviteSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    mode,
    email,
    password,
    firstName,
    lastName,
    displayName,
    role,
    departmentId,
    businessRoleId,
    managerId,
  } = parsed.data;

  let admin;

  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof ServiceRoleUnavailableError) {
      return failureState(SERVICE_ROLE_UNAVAILABLE_MESSAGE);
    }

    throw error;
  }

  // The sign-up trigger reads these from the user metadata, so the profile is
  // usable the moment the account exists.
  const metadata = {
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
  };

  const result =
    mode === "invite"
      ? await admin.auth.admin.inviteUserByEmail(email, { data: metadata })
      : await admin.auth.admin.createUser({
          email,
          password: password ?? undefined,
          email_confirm: true,
          user_metadata: metadata,
        });

  if (result.error) {
    console.error("Supabase Auth refused to create a portal user:", result.error.message);
    return failureState(provisioningErrorMessage(result.error.message));
  }

  const createdUser = result.data.user;

  if (!createdUser) {
    return failureState(
      "Supabase created the account but did not return it. Check Authentication → Users in Supabase, then link the account below.",
    );
  }

  const profileError = await applyDirectoryFields(createdUser.id, {
    email,
    firstName,
    lastName,
    displayName,
    role,
    departmentId,
    businessRoleId,
    managerId,
  });

  if (profileError) return profileError;

  revalidateUserDirectory();

  return successState(
    mode === "invite"
      ? `${email} was invited. Supabase emailed a link to set a password, and their portal profile is already configured.`
      : `${email} can sign in now with the password you set. Use this for test accounts; invite real employees instead.`,
  );
}

// ---------------------------------------------------------------------------
// Linking an existing Supabase Auth user
// ---------------------------------------------------------------------------

export async function linkExistingPortalUser(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return auth.denied;

  const parsed = portalUserLinkSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    authUserId,
    email,
    firstName,
    lastName,
    displayName,
    role,
    departmentId,
    businessRoleId,
    managerId,
  } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("profiles")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();

  if (existing.error) {
    return mutationErrorState(existing.error, "user");
  }

  if (existing.data) {
    return failureState(
      "That Supabase Auth user already has a portal profile. Configure them in the directory below instead.",
    );
  }

  const { error } = await supabase.from("profiles").insert({
    id: authUserId,
    email,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    role,
    department_id: departmentId,
    business_role_id: businessRoleId,
    manager_id: managerId,
  });

  if (error) return mutationErrorState(error, "user");

  revalidateUserDirectory();

  return successState(
    `Linked ${email} to their Supabase Auth account. Assign their compensation plan under Commissions → Employees.`,
  );
}

// ---------------------------------------------------------------------------
// Editing an existing portal user
// ---------------------------------------------------------------------------

export async function updatePortalUser(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return auth.denied;

  const parsed = portalUserUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    profileId,
    firstName,
    lastName,
    displayName,
    role,
    departmentId,
    businessRoleId,
    managerId,
    active,
  } = parsed.data;

  // An administrator can lock themselves out of the portal with one save. Both
  // cases need a second administrator, so refuse them here as well as in the UI.
  if (profileId === auth.userId) {
    if (!active) {
      return failureState(
        "You cannot deactivate your own account. Ask another administrator to do it.",
      );
    }

    if (role !== "admin" && role !== "ceo") {
      return failureState(
        "You cannot remove your own administrator role. Ask another administrator to do it.",
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      role,
      department_id: departmentId,
      business_role_id: businessRoleId,
      manager_id: managerId,
      active,
    })
    .eq("id", profileId)
    .select("id");

  if (error) return mutationErrorState(error, "user");

  if ((data ?? []).length === 0) {
    return failureState("That portal user no longer exists. Refresh the page and try again.");
  }

  revalidateUserDirectory();

  return successState(
    "Portal user updated. Name, security role, department, business role, manager and status changes are recorded in the audit trail.",
  );
}
