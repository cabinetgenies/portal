/**
 * The reviewed, versioned agent/skill/tool registry.
 *
 * Manifests live here as code (mirrored by the human-readable files under `ai/`)
 * so the server can validate them at build/startup without reading arbitrary
 * filesystem paths or installing anything at runtime. An administrator can
 * disable or narrow an agent's allowed tools through `ai_agent_configs`, but can
 * never introduce a tool, host, code path or permission that is not in this
 * registry.
 */

export const ORCHESTRATOR_AGENT_ID = "orchestrator";

export type AgentManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  modelAlias: string;
  skillIds: readonly string[];
  allowedToolIds: readonly string[];
  /** Per-tool maximum invocations within one run. */
  toolLimits: Readonly<Record<string, number>>;
  /** Missing prerequisites are rendered honestly, never fabricated. */
  disabledReason: string | null;
};

export type SkillManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  body: string;
};

export type ToolManifest = {
  id: string;
  name: string;
  description: string;
  /** Capabilities that authorize the underlying read (any one). */
  capabilities: readonly string[];
};

const DEFERRED_SPECIALIST_REASON =
  "Deferred while Ask BOS runs as a single permission-aware assistant. Reserved for a future execution engine.";

export const AGENT_MANIFESTS: readonly AgentManifest[] = [
  {
    id: ORCHESTRATOR_AGENT_ID,
    name: "Ask BOS",
    description:
      "The single permission-aware Cabinet Genies assistant for approved knowledge, commission questions, analysis and communication drafts.",
    version: "7a.3",
    modelAlias: "default",
    skillIds: ["find-approved-procedure", "explain-commission", "draft-customer-update"],
    allowedToolIds: [
      "searchApprovedKnowledge",
      "readApprovedKnowledgeItem",
      "getCompanyCommissionStructure",
      "getMyCommissionSummary",
      "getProjectCommissionContext",
      "previewCommissionScenario",
    ],
    toolLimits: {
      searchApprovedKnowledge: 4,
      readApprovedKnowledgeItem: 6,
      getCompanyCommissionStructure: 2,
      getMyCommissionSummary: 1,
      getProjectCommissionContext: 4,
      previewCommissionScenario: 4,
    },
    disabledReason: null,
  },
  {
    id: "company-guide",
    name: "Company Guide",
    description:
      "Legacy specialist manifest retained for future execution-engine work. Ask BOS now handles approved knowledge directly.",
    version: "7a.1",
    modelAlias: "default",
    skillIds: ["find-approved-procedure"],
    allowedToolIds: ["searchApprovedKnowledge", "readApprovedKnowledgeItem"],
    toolLimits: { searchApprovedKnowledge: 4, readApprovedKnowledgeItem: 6 },
    disabledReason: DEFERRED_SPECIALIST_REASON,
  },
  {
    id: "sales-commission",
    name: "Sales & Commission",
    description:
      "Legacy specialist manifest retained for future execution-engine work. Ask BOS now handles permitted commission questions directly.",
    version: "7a.1",
    modelAlias: "default",
    skillIds: ["explain-commission"],
    allowedToolIds: [
      "getMyCommissionSummary",
      "getProjectCommissionContext",
      "previewCommissionScenario",
    ],
    toolLimits: {
      getMyCommissionSummary: 1,
      getProjectCommissionContext: 4,
      previewCommissionScenario: 4,
    },
    disabledReason: DEFERRED_SPECIALIST_REASON,
  },
  {
    id: "communications",
    name: "Communications",
    description:
      "Legacy specialist manifest retained for future execution-engine work. Ask BOS now drafts communications directly.",
    version: "7a.1",
    modelAlias: "default",
    skillIds: ["draft-customer-update"],
    allowedToolIds: [],
    toolLimits: {},
    disabledReason: DEFERRED_SPECIALIST_REASON,
  },
  {
    id: "leadership",
    name: "Leadership",
    description:
      "Reserved specialist for a future execution engine. Leadership AI is not part of the Ask BOS release.",
    version: "7a.1",
    modelAlias: "default",
    skillIds: [],
    allowedToolIds: ["getLeadershipMeetingContext"],
    toolLimits: { getLeadershipMeetingContext: 2 },
    disabledReason:
      "Leadership AI is deferred and requires separate authorization review before any future enablement.",
  },
] as const;

export const SKILL_MANIFESTS: readonly SkillManifest[] = [
  {
    id: "find-approved-procedure",
    name: "Find an approved procedure",
    description:
      "Retrieve only published, company-approved knowledge and cite the exact item and version.",
    version: "7a.1",
    body:
      "Search published knowledge only. Prefer an exact role or department match. If no published item supports the answer, say that and do not invent Cabinet Genies policy. Return the item id, title, type, version timestamp and a short faithful summary.",
  },
  {
    id: "explain-commission",
    name: "Explain commission",
    description:
      "Explain company, project or employee commission using the deterministic compensation configuration and engine; never change rates, balances or history.",
    version: "7a.2",
    body:
      "For company-level commission-structure questions, use getCompanyCommissionStructure when authorized and treat the compensation plan/version/tier tables as the system of record. For employee or project questions, use the appropriate read-only commission tools. Explain the version actually assigned, projected versus approved versus paid, draw and rollover from the canonical engine result. Do not recalculate or alter stored events, balances, rates or history. What-if calculations are transient and never update the project.",
  },
  {
    id: "draft-customer-update",
    name: "Draft a customer update",
    description:
      "Draft a customer email or message from provided or permitted facts only.",
    version: "7a.1",
    body:
      "Use only facts supplied by the user or returned by permitted tools. Do not invent shipment dates, customer consent, price concessions or promises. Return a subject and body as a draft with any missing information listed. Never mark it sent.",
  },
] as const;

export const TOOL_MANIFESTS: readonly ToolManifest[] = [
  {
    id: "searchApprovedKnowledge",
    name: "Search approved knowledge",
    description:
      "Search published, company-approved knowledge items visible to the signed-in user.",
    capabilities: [],
  },
  {
    id: "readApprovedKnowledgeItem",
    name: "Read an approved knowledge item",
    description:
      "Read one published knowledge item by id and return its approved content.",
    capabilities: [],
  },
  {
    id: "getCompanyCommissionStructure",
    name: "Company commission structure",
    description:
      "Return active compensation plans, current effective versions and tier rates from the authoritative compensation configuration.",
    capabilities: ["view:compensation-config"],
  },
  {
    id: "getMyCommissionSummary",
    name: "My commission summary",
    description: "Return the signed-in employee's own commission summary.",
    capabilities: ["view:own-commission"],
  },
  {
    id: "getProjectCommissionContext",
    name: "Project commission context",
    description:
      "Return a permitted project's commission plan, events, projected/approved/paid amounts and draw/rollover context.",
    capabilities: ["view:financials", "view:own-commission", "calculate:commission"],
  },
  {
    id: "previewCommissionScenario",
    name: "Preview a commission scenario",
    description:
      "Run a transient what-if commission calculation without updating anything.",
    capabilities: ["view:financials", "calculate:commission"],
  },
  {
    id: "getLeadershipMeetingContext",
    name: "Leadership meeting context",
    description:
      "Return authorized Phase 6 scorecards, priorities, issues and actions for a meeting brief.",
    capabilities: ["view:performance-own", "view:performance-team", "view:performance-all"],
  },
] as const;

export function agentById(id: string): AgentManifest | null {
  return AGENT_MANIFESTS.find((agent) => agent.id === id) ?? null;
}

export function skillById(id: string): SkillManifest | null {
  return SKILL_MANIFESTS.find((skill) => skill.id === id) ?? null;
}

export function toolById(id: string): ToolManifest | null {
  return TOOL_MANIFESTS.find((tool) => tool.id === id) ?? null;
}

/** Startup/build validation. Throws on a misconfigured registry. */
export function validateRegistry() {
  const agentIds = new Set(AGENT_MANIFESTS.map((agent) => agent.id));
  const toolIds = new Set(TOOL_MANIFESTS.map((tool) => tool.id));
  const skillIds = new Set(SKILL_MANIFESTS.map((skill) => skill.id));

  for (const agent of AGENT_MANIFESTS) {
    if (!agentIds.has(agent.id)) throw new Error(`Duplicate or missing agent id: ${agent.id}`);
    for (const skillId of agent.skillIds) {
      if (!skillIds.has(skillId)) throw new Error(`${agent.id} references unknown skill ${skillId}`);
    }
    for (const toolId of agent.allowedToolIds) {
      if (!toolIds.has(toolId)) throw new Error(`${agent.id} references unknown tool ${toolId}`);
    }
    for (const toolId of Object.keys(agent.toolLimits)) {
      if (!agent.allowedToolIds.includes(toolId)) {
        throw new Error(`${agent.id} limits a tool it does not allow: ${toolId}`);
      }
    }
  }

  if (!agentIds.has(ORCHESTRATOR_AGENT_ID)) {
    throw new Error("The Ask BOS assistant manifest is missing.");
  }

  return { agents: AGENT_MANIFESTS.length, skills: SKILL_MANIFESTS.length, tools: TOOL_MANIFESTS.length };
}
