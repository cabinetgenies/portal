"use server";

import { revalidatePath } from "next/cache";

import { departmentUpdateSchema } from "@/lib/admin/department-validation";
import { authorizeCapability } from "@/lib/auth/authorize";
import {
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Department edits.
 *
 * Capability-checked here, and enforced again by the `departments` RLS policy and
 * the department audit trigger in Postgres. Basic on purpose: an administrator can
 * correct the name, description, owner and active status, which is what this phase
 * needs. Creating and deleting departments stays a migration-level change while the
 * official ten are still settling.
 */
export async function updateDepartment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return auth.denied;

  const parsed = departmentUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { departmentId, name, description, ownerProfileId, active } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("departments")
    .update({
      name,
      description,
      owner_profile_id: ownerProfileId,
      active,
    })
    .eq("id", departmentId);

  if (error) return mutationErrorState(error, "department");

  revalidatePath("/admin/departments");
  revalidatePath("/admin/roles");
  revalidatePath("/home");

  return successState("Department updated. The change is recorded in the audit trail.");
}
