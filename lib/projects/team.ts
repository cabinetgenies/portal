"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import { failureState, successState, type ActionState } from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProjectTeamMember = {
  id: string;
  profileId: string;
  name: string;
  email: string | null;
  roleLabel: string;
  sortOrder: number;
};

export type ProjectTeamOption = {
  id: string;
  name: string;
  email: string | null;
};

export async function listProjectTeam(jobId: string): Promise<ProjectTeamMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_team_members")
    .select("id, profile_id, role_label, sort_order, profiles!job_team_members_profile_id_fkey(display_name, first_name, last_name, email)")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not load project team:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => {
    const profile = row.profiles;
    const combined = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    return {
      id: row.id,
      profileId: row.profile_id,
      name: combined || profile?.display_name || profile?.email || "Team member",
      email: profile?.email ?? null,
      roleLabel: row.role_label,
      sortOrder: row.sort_order ?? 0,
    };
  });
}

export async function listProjectTeamOptions(): Promise<ProjectTeamOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, first_name, last_name, email")
    .eq("active", true)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("Could not load project team options:", error.message);
    return [];
  }

  return (data ?? []).map((profile: any) => {
    const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    return {
      id: profile.id,
      name: combined || profile.display_name || profile.email || "Portal user",
      email: profile.email,
    };
  });
}

export async function addProjectTeamMember(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();

  if (!jobId || !profileId) return failureState("Choose a team member.");
  if (roleLabel.length < 2) return failureState("Enter the team member's project role.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("job_team_members").insert({
    job_id: jobId,
    profile_id: profileId,
    role_label: roleLabel,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "job");
  revalidatePath(`/projects/${jobId}`);
  return successState("Team member added.");
}

export async function updateProjectTeamMember(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();

  if (!jobId || !memberId) return failureState("That project team member is unavailable.");
  if (roleLabel.length < 2) return failureState("Enter the team member's project role.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_team_members")
    .update({ role_label: roleLabel })
    .eq("id", memberId)
    .eq("job_id", jobId);

  if (error) return mutationErrorState(error, "job");
  revalidatePath(`/projects/${jobId}`);
  return successState("Project role updated.");
}

export async function removeProjectTeamMember(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  if (!jobId || !memberId) return failureState("That project team member is unavailable.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_team_members")
    .delete()
    .eq("id", memberId)
    .eq("job_id", jobId);

  if (error) return mutationErrorState(error, "job");
  revalidatePath(`/projects/${jobId}`);
  return successState("Team member removed.");
}
