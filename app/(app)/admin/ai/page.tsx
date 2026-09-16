import { EmptyState } from "@/components/empty-state/empty-state";
import { PageHeader } from "@/components/page-header/page-header";
import { Panel } from "@/components/ui/panel";
import {
  setAgentEnabled,
  setAgentKillSwitch,
  setRoleAgentEnabled,
} from "@/lib/ai/admin-actions";
import { aiAvailability } from "@/lib/ai/config";
import { AGENT_MANIFESTS, agentById } from "@/lib/ai/registry";
import { requireCapability } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import type {
  AiAgentConfigRow,
  AiRoleAgentRow,
  AiRunRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata = {
  title: "AI",
};

export default async function AdminAiPage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const availability = aiAvailability();
  const catalog = await loadExperienceCatalog();
  const supabase = await createSupabaseServerClient();
  const [configsResult, roleAgentsResult, runsResult] = await Promise.all([
    supabase.from("ai_agent_configs").select("*"),
    supabase.from("ai_role_agents").select("*"),
    supabase.from("ai_runs").select("status, total_tokens"),
  ]);

  const configs = (configsResult.data ?? []) as AiAgentConfigRow[];
  const roleAgents = (roleAgentsResult.data ?? []) as AiRoleAgentRow[];
  const runs = (runsResult.data ?? []) as Pick<AiRunRow, "status" | "total_tokens">[];
  const configById = new Map(configs.map((config) => [config.agent_id, config]));
  const roleEnabled = new Set(
    roleAgents.filter((row) => row.enabled).map((row) => `${row.business_role_id}:${row.agent_id}`),
  );

  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const totalTokens = runs.reduce((total, run) => total + Number(run.total_tokens ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="AI assistant"
        description="Reviewed agents, deployed versions, allowed tools, pilot access and usage. AI is off by default until enabled for a pilot."
      />

      {!availability.configured ? (
        <div className="rounded-xl border border-line bg-accent-soft px-4 py-4">
          <p className="text-sm font-medium text-accent-strong">AI is not configured.</p>
          <p className="mt-1 text-sm text-accent-strong">
            Set the server model and API key, then enable a pilot role below. No fake response is
            ever rendered when the provider is missing.
          </p>
        </div>
      ) : null}

      <Panel
        id="ai-agents"
        title="Agents"
        description="The maximum tool set is enforced by the server registry. Configuration can only disable or narrow it."
      >
        <ul className="space-y-4">
          {AGENT_MANIFESTS.map((manifest) => {
            const config = configById.get(manifest.id);
            const enabled = config?.enabled === true && config.kill_switch !== true;
            const registryDisabled = manifest.disabledReason !== null;

            return (
              <li
                key={manifest.id}
                className="rounded-lg border border-line bg-surface-muted p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{manifest.name}</p>
                    <p className="font-mono text-xs text-ink-subtle">
                      {manifest.id} · v{manifest.version}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      enabled
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-line bg-surface text-ink-muted",
                    )}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-ink-muted">{manifest.description}</p>
                {registryDisabled ? (
                  <p className="mt-2 text-xs text-accent-strong">{registryDisabled}</p>
                ) : null}
                <p className="mt-2 text-xs text-ink-subtle">
                  Model: {config?.model_alias || manifest.modelAlias} · tools:{" "}
                  {manifest.allowedToolIds.length > 0
                    ? manifest.allowedToolIds.join(", ")
                    : "none"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={setAgentEnabled}>
                    <input type="hidden" name="agentId" value={manifest.id} />
                    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                    <button
                      type="submit"
                      disabled={registryDisabled}
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
                    >
                      {enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={setAgentKillSwitch}>
                    <input type="hidden" name="agentId" value={manifest.id} />
                    <input
                      type="hidden"
                      name="killSwitch"
                      value={config?.kill_switch ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
                    >
                      {config?.kill_switch ? "Clear kill switch" : "Kill switch"}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        id="ai-pilot"
        title="Pilot access"
        description="Map business roles to agents. A business role still never grants authorization; the verified security role and Row Level Security stay authoritative."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-subtle uppercase">
                <th className="py-2 pr-4 font-medium">Business role</th>
                {AGENT_MANIFESTS.map((agent) => (
                  <th key={agent.id} className="px-2 py-2 text-center font-medium">
                    {agentById(agent.id)?.name ?? agent.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.businessRoles.map((role) => (
                <tr key={role.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">
                    <p className="font-medium text-ink">{role.name}</p>
                    <p className="font-mono text-xs text-ink-subtle">{role.key}</p>
                  </td>
                  {AGENT_MANIFESTS.map((agent) => {
                    const active = roleEnabled.has(`${role.id}:${agent.id}`);

                    return (
                      <td key={agent.id} className="px-2 py-2 text-center">
                        <form action={setRoleAgentEnabled}>
                          <input type="hidden" name="businessRoleId" value={role.id} />
                          <input type="hidden" name="agentId" value={agent.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={active ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            aria-label={`${active ? "Disable" : "Enable"} ${agent.id} for ${role.name}`}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs font-medium",
                              active
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-line bg-surface text-ink-muted hover:border-line-strong",
                            )}
                          >
                            {active ? "On" : "Off"}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="ai-usage" title="Usage">
        {runsResult.error ? (
          <EmptyState title="Usage unavailable" description="Apply the Phase 7A migration to read assistant usage." />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
                Runs
              </dt>
              <dd className="text-sm text-ink">{runs.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
                Failed
              </dt>
              <dd className="text-sm text-ink">{failedRuns}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
                Total tokens
              </dt>
              <dd className="text-sm text-ink">{totalTokens.toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </Panel>
    </div>
  );
}

