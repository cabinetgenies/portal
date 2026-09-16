import { getSessionExperience } from "@/lib/experience/queries";
import { aiAvailability, getAiServerConfig } from "@/lib/ai/config";
import { AGENT_MANIFESTS, agentById, ORCHESTRATOR_AGENT_ID } from "@/lib/ai/registry";
import type { AuthorizedSession } from "@/lib/auth/dal";
import type {
  AiAgentConfigRow,
  AiRoleAgentRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Pilot access and runtime feature controls.
 *
 * Identity, capabilities and profile status come from the verified session.
 * Effective access is the intersection of: provider configured, agent manifest
 * present, registry agent not disabled, admin feature control enabled and not
 * killed, and a pilot role-agent mapping for the signed-in business role.
 */

export type EffectiveAgentAccess = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  modelAlias: string;
  allowedToolIds: readonly string[];
  toolLimits: Readonly<Record<string, number>>;
  disabledReason: string | null;
  killSwitch: boolean;
};

export type AiAccessResult = {
  configured: boolean;
  providerModel: string;
  allowed: boolean;
  reason: string | null;
  businessRoleKey: string | null;
  agents: EffectiveAgentAccess[];
};

function narrowAllowedTools(
  manifestToolIds: readonly string[],
  configured: AiAgentConfigRow | undefined,
): string[] {
  if (!configured || configured.allowed_tools.length === 0) {
    return [...manifestToolIds];
  }

  return configured.allowed_tools.filter((toolId) => manifestToolIds.includes(toolId));
}

function narrowToolLimits(
  manifestToolIds: readonly string[],
  manifestLimits: Readonly<Record<string, number>>,
  configured: AiAgentConfigRow | undefined,
): Record<string, number> {
  const limits: Record<string, number> = { ...manifestLimits };
  if (!configured?.tool_limits || typeof configured.tool_limits !== "object") {
    return limits;
  }

  for (const [toolId, value] of Object.entries(configured.tool_limits)) {
    if (!manifestToolIds.includes(toolId)) continue;
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0) {
      limits[toolId] = Math.min(numeric, manifestLimits[toolId] ?? numeric);
    }
  }

  return limits;
}

export async function resolveAiAccess(session: AuthorizedSession): Promise<AiAccessResult> {
  const availability = aiAvailability();
  const experience = await getSessionExperience();
  const businessRoleKey = experience?.experience.roleKey ?? null;
  const businessRoleId = session.profile.business_role_id;

  if (!availability.configured) {
    return {
      configured: false,
      providerModel: availability.model,
      allowed: false,
      reason: "AI is not configured. An administrator must set the server model and API key.",
      businessRoleKey,
      agents: [],
    };
  }

  if (!businessRoleId) {
    return {
      configured: true,
      providerModel: availability.model,
      allowed: false,
      reason: "Your profile does not have a business role assigned, so you are not in the AI pilot.",
      businessRoleKey,
      agents: [],
    };
  }

  const supabase = await createSupabaseServerClient();
  const [configResult, roleResult] = await Promise.all([
    supabase.from("ai_agent_configs").select("*"),
    supabase
      .from("ai_role_agents")
      .select("*")
      .eq("business_role_id", businessRoleId),
  ]);

  if (configResult.error || roleResult.error) {
    return {
      configured: true,
      providerModel: availability.model,
      allowed: false,
      reason: "AI feature controls are unavailable. Ask an administrator to apply the Phase 7A migration.",
      businessRoleKey,
      agents: [],
    };
  }

  const configs = (configResult.data ?? []) as AiAgentConfigRow[];
  const roleAgents = (roleResult.data ?? []) as AiRoleAgentRow[];
  const configById = new Map(configs.map((config) => [config.agent_id, config]));
  const roleEnabledById = new Map(
    roleAgents.filter((row) => row.enabled).map((row) => [row.agent_id, true]),
  );

  const agents: EffectiveAgentAccess[] = AGENT_MANIFESTS.map((manifest) => {
    const config = configById.get(manifest.id);
    const roleEnabled = roleEnabledById.has(manifest.id);
    const registryDisabled = manifest.disabledReason !== null;
    const configEnabled = config?.enabled ?? false;
    const killSwitch = config?.kill_switch ?? false;
    const enabled = !registryDisabled && configEnabled && roleEnabled && !killSwitch;
    const disabledReason = registryDisabled
      ? manifest.disabledReason
      : !configEnabled
        ? "Disabled in AI feature controls."
        : !roleEnabled
          ? "Not enabled for this business role's pilot."
          : killSwitch
            ? "Kill switch is active."
            : null;

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled,
      modelAlias: config?.model_alias || manifest.modelAlias,
      allowedToolIds: narrowAllowedTools(manifest.allowedToolIds, config),
      toolLimits: narrowToolLimits(manifest.allowedToolIds, manifest.toolLimits, config),
      disabledReason,
      killSwitch,
    };
  });

  const orchestrator = agents.find((agent) => agent.id === ORCHESTRATOR_AGENT_ID);
  const allowed = orchestrator?.enabled === true;

  return {
    configured: true,
    providerModel: availability.model,
    allowed,
    reason: allowed
      ? null
      : (orchestrator?.disabledReason ??
        "The assistant is not enabled for your role. Ask an administrator to enable the AI pilot."),
    businessRoleKey,
    agents,
  };
}

export type DailyQuotaState = {
  allowed: boolean;
  runsToday: number;
  tokensToday: number;
};

export async function getDailyQuotaState(userId: string): Promise<DailyQuotaState> {
  const config = getAiServerConfig();
  const supabase = await createSupabaseServerClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("ai_runs")
    .select("total_tokens")
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) {
    // Fail closed: a missing table or denied read should not open a quota bypass.
    return { allowed: false, runsToday: 0, tokensToday: 0 };
  }

  const rows = (data ?? []) as { total_tokens: number | null }[];
  const runsToday = rows.length;
  const tokensToday = rows.reduce((total, row) => total + Number(row.total_tokens ?? 0), 0);

  return {
    allowed: runsToday < config.dailyQuota,
    runsToday,
    tokensToday,
  };
}

/** Registry-visible agent names for the role experience preview. */
export function agentNameForId(id: string) {
  return agentById(id)?.name ?? id;
}

