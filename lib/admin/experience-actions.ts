"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  CONFIGURATION_CAPABILITY,
  isExperienceKind,
  type ExperienceKind,
} from "@/lib/experience/kinds";
import {
  changedOrderRows,
  isMoveDirection,
  reorderAssignments,
  type MoveDirection,
  type OrderedAssignment,
} from "@/lib/experience/ordering";
import { failureState, successState, type ActionState } from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Role experience configuration writes.
 *
 * Everything an administrator can change about a role's experience — module
 * visibility and order, dashboard widgets, quick actions — goes through here.
 * Three layers agree on who may do it:
 *
 *   1. the pages sit behind `requireCapability("administer:portal")`,
 *   2. these actions re-check the same capability before touching anything,
 *   3. and the RLS policies on role_modules / role_dashboard_widgets /
 *      role_quick_actions allow admin and CEO only.
 *
 * None of it can widen anybody's access. These tables decide what is *shown*; the
 * capability requirements that gate a module live in code, and the domain tables
 * keep their own policies.
 *
 * A visibility toggle only ever flips `is_visible` — the row is never deleted, so
 * the configuration keeps the fact that something was assigned and the audit
 * trigger keeps the change.
 */

type AssignmentRecord = {
  id: string;
  displayOrder: number;
  /** Registry key of the module, widget or action this row points at. */
  key: string | null;
};

function revalidateRole(roleId: string) {
  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/role-experiences");
  revalidatePath("/home");
}

export async function setRoleExperienceVisibility(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability(CONFIGURATION_CAPABILITY);
  if ("denied" in auth) return auth.denied;

  const roleId = readString(formData, "roleId");
  const key = readString(formData, "key");
  const kind = readString(formData, "kind");
  const visible = readString(formData, "visible") === "true";

  if (!roleId || !key || !isExperienceKind(kind)) {
    return failureState("That configuration change could not be read. Reload the page.");
  }

  const error = await writeVisibility(kind, roleId, key, visible);
  if (error) return error;

  revalidateRole(roleId);

  return successState(visible ? "Shown for this role." : "Hidden for this role.");
}

export async function moveRoleExperienceAssignment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability(CONFIGURATION_CAPABILITY);
  if ("denied" in auth) return auth.denied;

  const roleId = readString(formData, "roleId");
  const key = readString(formData, "key");
  const kind = readString(formData, "kind");
  const direction = readString(formData, "direction");

  if (!roleId || !key || !isExperienceKind(kind) || !isMoveDirection(direction)) {
    return failureState("That reorder could not be read. Reload the page.");
  }

  const loaded = await loadAssignments(kind, roleId);
  if (loaded.error) return loaded.error;

  const before: OrderedAssignment[] = loaded.records
    .filter((record): record is AssignmentRecord & { key: string } => record.key !== null)
    .map((record) => ({ key: record.key, displayOrder: record.displayOrder }));

  if (!before.some((entry) => entry.key === key)) {
    return failureState("That item is not assigned to this role.");
  }

  const after = reorderAssignments(before, key, direction as MoveDirection);

  for (const entry of changedOrderRows(before, after)) {
    const record = loaded.records.find((candidate) => candidate.key === entry.key);
    if (!record) continue;

    const error = await writeDisplayOrder(kind, record.id, entry.displayOrder);
    if (error) return error;
  }

  revalidateRole(roleId);

  return successState("Order updated.");
}

// ---------------------------------------------------------------------------
// Per-kind data access
//
// Written out per kind rather than through a dynamic table name: the Supabase
// client is typed per table, and a dynamic name would need a cast that erases the
// table's shape.
// ---------------------------------------------------------------------------

async function loadAssignments(
  kind: ExperienceKind,
  roleId: string,
): Promise<{ records: AssignmentRecord[]; error: ActionState | null }> {
  const supabase = await createSupabaseServerClient();

  if (kind === "module") {
    const { data, error } = await supabase
      .from("role_modules")
      .select("id, display_order, module_id")
      .eq("business_role_id", roleId);

    if (error) return { records: [], error: mutationErrorState(error, "role_experience") };

    const keys = await moduleKeys((data ?? []).map((row) => row.module_id));

    return {
      records: (data ?? []).map((row) => ({
        id: row.id,
        displayOrder: row.display_order,
        key: keys.get(row.module_id) ?? null,
      })),
      error: null,
    };
  }

  if (kind === "widget") {
    const { data, error } = await supabase
      .from("role_dashboard_widgets")
      .select("id, display_order, widget_id")
      .eq("business_role_id", roleId);

    if (error) return { records: [], error: mutationErrorState(error, "role_experience") };

    const keys = await widgetKeys((data ?? []).map((row) => row.widget_id));

    return {
      records: (data ?? []).map((row) => ({
        id: row.id,
        displayOrder: row.display_order,
        key: keys.get(row.widget_id) ?? null,
      })),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("role_quick_actions")
    .select("id, display_order, quick_action_id")
    .eq("business_role_id", roleId);

  if (error) return { records: [], error: mutationErrorState(error, "role_experience") };

  const keys = await quickActionKeys((data ?? []).map((row) => row.quick_action_id));

  return {
    records: (data ?? []).map((row) => ({
      id: row.id,
      displayOrder: row.display_order,
      key: keys.get(row.quick_action_id) ?? null,
    })),
    error: null,
  };
}

async function writeVisibility(
  kind: ExperienceKind,
  roleId: string,
  key: string,
  visible: boolean,
): Promise<ActionState | null> {
  const supabase = await createSupabaseServerClient();

  // Showing something the role was never assigned is a legitimate change: the row
  // is created rather than quietly doing nothing. Hiding always updates, and the
  // assignment row is kept so the decision stays visible in the configuration.
  const loaded = await loadAssignments(kind, roleId);
  if (loaded.error) return loaded.error;

  const existing = loaded.records.find((record) => record.key === key);
  const nextOrder =
    loaded.records.reduce((highest, record) => Math.max(highest, record.displayOrder), 0) + 10;

  if (kind === "module") {
    const id = await moduleId(key);
    if (!id) return unknownRegistryItem();

    if (!existing) {
      const { error } = await supabase.from("role_modules").insert({
        business_role_id: roleId,
        module_id: id,
        is_visible: visible,
        display_order: nextOrder,
      });

      return error ? mutationErrorState(error, "role_experience") : null;
    }

    const { error } = await supabase
      .from("role_modules")
      .update({ is_visible: visible })
      .eq("business_role_id", roleId)
      .eq("module_id", id);

    return error ? mutationErrorState(error, "role_experience") : null;
  }

  if (kind === "widget") {
    const id = await widgetId(key);
    if (!id) return unknownRegistryItem();

    if (!existing) {
      const { error } = await supabase.from("role_dashboard_widgets").insert({
        business_role_id: roleId,
        widget_id: id,
        is_visible: visible,
        display_order: nextOrder,
      });

      return error ? mutationErrorState(error, "role_experience") : null;
    }

    const { error } = await supabase
      .from("role_dashboard_widgets")
      .update({ is_visible: visible })
      .eq("business_role_id", roleId)
      .eq("widget_id", id);

    return error ? mutationErrorState(error, "role_experience") : null;
  }

  const id = await quickActionId(key);
  if (!id) return unknownRegistryItem();

  if (!existing) {
    const { error } = await supabase.from("role_quick_actions").insert({
      business_role_id: roleId,
      quick_action_id: id,
      is_visible: visible,
      display_order: nextOrder,
    });

    return error ? mutationErrorState(error, "role_experience") : null;
  }

  const { error } = await supabase
    .from("role_quick_actions")
    .update({ is_visible: visible })
    .eq("business_role_id", roleId)
    .eq("quick_action_id", id);

  return error ? mutationErrorState(error, "role_experience") : null;
}

async function writeDisplayOrder(
  kind: ExperienceKind,
  assignmentId: string,
  displayOrder: number,
): Promise<ActionState | null> {
  const supabase = await createSupabaseServerClient();

  if (kind === "module") {
    const { error } = await supabase
      .from("role_modules")
      .update({ display_order: displayOrder })
      .eq("id", assignmentId);

    return error ? mutationErrorState(error, "role_experience") : null;
  }

  if (kind === "widget") {
    const { error } = await supabase
      .from("role_dashboard_widgets")
      .update({ display_order: displayOrder })
      .eq("id", assignmentId);

    return error ? mutationErrorState(error, "role_experience") : null;
  }

  const { error } = await supabase
    .from("role_quick_actions")
    .update({ display_order: displayOrder })
    .eq("id", assignmentId);

  return error ? mutationErrorState(error, "role_experience") : null;
}

async function moduleId(key: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_modules")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (error) console.error("Could not resolve the module:", error.message);
  return data?.id ?? null;
}

async function widgetId(key: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_widgets")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (error) console.error("Could not resolve the widget:", error.message);
  return data?.id ?? null;
}

async function quickActionId(key: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quick_actions")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (error) console.error("Could not resolve the quick action:", error.message);
  return data?.id ?? null;
}

async function moduleKeys(ids: readonly string[]) {
  const unique = Array.from(new Set(ids));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("app_modules").select("id, key").in("id", unique);
  if (error) console.error("Could not read the module registry:", error.message);

  for (const row of data ?? []) map.set(row.id, row.key);
  return map;
}

async function widgetKeys(ids: readonly string[]) {
  const unique = Array.from(new Set(ids));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_widgets")
    .select("id, key")
    .in("id", unique);
  if (error) console.error("Could not read the widget registry:", error.message);

  for (const row of data ?? []) map.set(row.id, row.key);
  return map;
}

async function quickActionKeys(ids: readonly string[]) {
  const unique = Array.from(new Set(ids));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("quick_actions").select("id, key").in("id", unique);
  if (error) console.error("Could not read the quick action registry:", error.message);

  for (const row of data ?? []) map.set(row.id, row.key);
  return map;
}

function unknownRegistryItem() {
  return failureState("That item is not in the registry, so there is nothing to change.");
}

function readString(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
