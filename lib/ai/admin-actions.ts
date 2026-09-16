"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeCapability } from "@/lib/auth/authorize";
import { agentById } from "@/lib/ai/registry";
import { formDataToObject } from "@/lib/forms/action-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Admin feature controls for the assistant.
 *
 * These only ever disable or narrow an agent's reviewed tool set; the server
 * registry is the maximum. There is deliberately no arbitrary prompt editor or
 * no-code agent builder in this phase.
 */

const agentConfigSchema = z.object({
  agentId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

const killSwitchSchema = z.object({
  agentId: z.string().min(1),
  killSwitch: z.enum(["true", "false"]),
});

const roleAgentSchema = z.object({
  businessRoleId: z.string().min(1),
  agentId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

function requireKnownAgent(agentId: string) {
  if (!agentById(agentId)) {
    return "That agent is not in the reviewed registry.";
  }
  return null;
}

export async function setAgentEnabled(
  formData: FormData,
): Promise<void> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return;

  const parsed = agentConfigSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;
  const invalid = requireKnownAgent(parsed.data.agentId);
  if (invalid) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ai_agent_configs").upsert(
    {
      agent_id: parsed.data.agentId,
      enabled: parsed.data.enabled === "true",
      model_alias: "default",
      allowed_tools: [],
      tool_limits: {},
      kill_switch: false,
    },
    { onConflict: "agent_id" },
  );

  if (error) {
    console.error("Could not update agent:", error.message);
    return;
  }

  revalidatePath("/admin/ai");
}

export async function setAgentKillSwitch(
  formData: FormData,
): Promise<void> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return;

  const parsed = killSwitchSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;
  const invalid = requireKnownAgent(parsed.data.agentId);
  if (invalid) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ai_agent_configs").upsert(
    {
      agent_id: parsed.data.agentId,
      enabled: false,
      model_alias: "default",
      allowed_tools: [],
      tool_limits: {},
      kill_switch: parsed.data.killSwitch === "true",
    },
    { onConflict: "agent_id" },
  );

  if (error) {
    console.error("Could not update agent:", error.message);
    return;
  }

  revalidatePath("/admin/ai");
}

export async function setRoleAgentEnabled(
  formData: FormData,
): Promise<void> {
  const auth = await authorizeCapability("administer:portal");
  if ("denied" in auth) return;

  const parsed = roleAgentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;
  const invalid = requireKnownAgent(parsed.data.agentId);
  if (invalid) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ai_role_agents").upsert(
    {
      business_role_id: parsed.data.businessRoleId,
      agent_id: parsed.data.agentId,
      enabled: parsed.data.enabled === "true",
    },
    { onConflict: "business_role_id,agent_id" },
  );

  if (error) {
    console.error("Could not update pilot access:", error.message);
    return;
  }

  revalidatePath("/admin/ai");
}
