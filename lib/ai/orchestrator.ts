import {
  assistantAnswerSchema,
  runPlanSchema,
  specialistResultSchema,
  type AssistantAnswer,
  type RunPlan,
  type SpecialistResult,
} from "@/lib/ai/schema";
import type { ZodType } from "zod";
import type { AiServerConfig } from "@/lib/ai/config";
import { EvidenceRegistry } from "@/lib/ai/evidence";
import {
  ORCHESTRATOR_INSTRUCTIONS,
  orchestratorPlanPrompt,
  specialistInstructions,
  synthesisInstructions,
  SOUL,
} from "@/lib/ai/instructions";
import type { ModelClient, ModelMessage, ModelToolDefinition, ModelStep } from "@/lib/ai/model";
import {
  agentById,
  ORCHESTRATOR_AGENT_ID,
  skillById,
} from "@/lib/ai/registry";
import { aiTools, type AiToolContext } from "@/lib/ai/tools";
import type { AuthorizedSession } from "@/lib/auth/dal";
import type { EffectiveAgentAccess } from "@/lib/ai/access";

/**
 * The bounded, permission-aware orchestrator controller.
 *
 * Human -> authenticated session -> authorized context -> orchestrator ->
 * specialist(s) -> validated results -> orchestrator -> human.
 *
 * Only the orchestrator talks to the user. Specialists return structured
 * results and can only request a dependency; this controller validates and
 * schedules it. Independent specialists run with bounded concurrency.
 */

export class AiControllerError extends Error {
  constructor(
    public readonly code:
      | "budget_exceeded"
      | "timeout"
      | "provider_error"
      | "invalid_output"
      | "not_configured"
      | "not_authorized",
    message: string,
  ) {
    super(message);
    this.name = "AiControllerError";
  }
}

export type OrchestratorResult = {
  answer: AssistantAnswer;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  modelCalls: number;
  toolCalls: number;
  specialistInvocations: number;
  steps: ModelStep[];
};

type OrchestratorInput = {
  session: AuthorizedSession;
  agents: EffectiveAgentAccess[];
  config: AiServerConfig;
  userMessage: string;
  modelClient: ModelClient;
  abortSignal?: AbortSignal;
};

function nowIso() {
  return new Date().toISOString();
}

function agentToolDefinitions(
  agent: EffectiveAgentAccess,
  ctx: AiToolContext,
): Record<string, ModelToolDefinition> {
  const tools: Record<string, ModelToolDefinition> = {};

  for (const toolId of agent.allowedToolIds) {
    const definition = aiTools[toolId as keyof typeof aiTools];
    if (!definition) continue;

    tools[toolId] = {
      name: toolId,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: (input) => definition.execute(input, ctx),
    };
  }

  return tools;
}

function sanitizeSpecialistForSynthesis(result: SpecialistResult, evidence: EvidenceRegistry) {
  const sources = (result.sources ?? [])
    .map((source) => evidence.toReference(source.id))
    .filter((reference): reference is NonNullable<typeof reference> => reference !== null);

  return {
    status: result.status,
    summary: result.summary,
    facts: result.facts,
    assumptions: result.assumptions,
    risks: result.risks ?? [],
    recommended_actions: result.recommended_actions ?? [],
    actions_taken: result.actions_taken ?? [],
    actions_requested: result.actions_requested ?? [],
    requires_approval: result.requires_approval ?? false,
    escalation: result.escalation ?? null,
    sources,
    confidence: result.confidence ?? null,
    missing_information: result.missing_information,
    proposed_actions: result.proposed_actions,
    warnings: result.warnings,
    artifact_references: result.artifact_references,
  };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { session, agents, config, userMessage, modelClient, abortSignal } = input;
  const evidence = new EvidenceRegistry();
  const startedAt = Date.now();
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const orchestrator = enabledAgents.find((agent) => agent.id === ORCHESTRATOR_AGENT_ID);

  if (!orchestrator) {
    throw new AiControllerError("not_authorized", "The assistant is not enabled for your role.");
  }

  const toolContext: AiToolContext = { session, evidence };
  const counters = {
    modelCalls: 0,
    toolCalls: 0,
    specialists: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  const allSteps: ModelStep[] = [];

  const assertRunning = () => {
    if (abortSignal?.aborted) {
      throw new AiControllerError("timeout", "The request was cancelled.");
    }
    if (Date.now() - startedAt > config.wallTimeMs) {
      throw new AiControllerError("timeout", "The assistant ran out of interactive time.");
    }
  };

  const consumeModelCalls = (count: number) => {
    counters.modelCalls += count;
    if (counters.modelCalls > config.maxModelCalls) {
      throw new AiControllerError(
        "budget_exceeded",
        "The assistant reached its model-call limit for this request.",
      );
    }
  };

  const consumeToolCalls = (count: number) => {
    counters.toolCalls += count;
    if (counters.toolCalls > config.maxToolCalls) {
      throw new AiControllerError(
        "budget_exceeded",
        "The assistant reached its tool-call limit for this request.",
      );
    }
  };

  const record = (result: { steps: ModelStep[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => {
    allSteps.push(...result.steps);
    counters.inputTokens += result.usage.inputTokens;
    counters.outputTokens += result.usage.outputTokens;
    const toolCount = result.steps.reduce((total, step) => total + step.toolCalls.length, 0);
    consumeToolCalls(toolCount);
    consumeModelCalls(Math.max(1, result.steps.length));
  };

  async function generateWithRepair<T>(opts: {
    schema: ZodType<T>;
    instructions: string;
    messages: ModelMessage[];
    tools?: Record<string, ModelToolDefinition>;
    maxSteps?: number;
  }): Promise<{ object: T; steps: ModelStep[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
    assertRunning();
    try {
      const result = await modelClient.generateStructured<T>({
        schema: opts.schema,
        instructions: opts.instructions,
        messages: opts.messages,
        tools: opts.tools,
        maxSteps: opts.maxSteps ?? Math.max(1, config.maxModelCalls - counters.modelCalls),
        abortSignal,
      });
      return result;
    } catch (error) {
      if (error instanceof AiControllerError) throw error;

      // One repair attempt for malformed or provider-rejected structured output.
      const result = await modelClient.generateStructured<T>({
        schema: opts.schema,
        instructions: `${opts.instructions}\n\nReturn valid JSON matching the schema exactly. Do not add commentary.`,
        messages: opts.messages,
        tools: opts.tools,
        maxSteps: opts.maxSteps ?? Math.max(1, config.maxModelCalls - counters.modelCalls),
        abortSignal,
      });
      return result;
    }
  }

  // 1. Plan.
  const planResult = await generateWithRepair<RunPlan>({
    schema: runPlanSchema,
    instructions: `${SOUL}\n\n${ORCHESTRATOR_INSTRUCTIONS}\n\n${orchestratorPlanPrompt(
      enabledAgents.map((agent) => ({ id: agent.id, name: agent.name })),
    )}`,
    messages: [{ role: "user", content: userMessage }],
    maxSteps: 1,
  });
  record(planResult);

  const plan: RunPlan = {
    agents: planResult.object.agents.filter((id) =>
      enabledAgents.some((agent) => agent.id === id && agent.id !== ORCHESTRATOR_AGENT_ID),
    ),
    direct_tools: planResult.object.direct_tools.filter((id) =>
      orchestrator.allowedToolIds.includes(id),
    ),
    rationale: planResult.object.rationale,
  };

  // 2. Direct deterministic tools (no specialists, no synthesis model call).
  if (plan.agents.length === 0 && plan.direct_tools.length > 0) {
    const answer = await runDirectTools(
      plan.direct_tools,
      userMessage,
      toolContext,
      evidence,
      counters,
      config,
      abortSignal,
      startedAt,
    );
    return {
      answer,
      usage: {
        inputTokens: counters.inputTokens,
        outputTokens: counters.outputTokens,
        totalTokens: counters.inputTokens + counters.outputTokens,
      },
      modelCalls: counters.modelCalls,
      toolCalls: counters.toolCalls,
      specialistInvocations: 0,
      steps: allSteps,
    };
  }

  // 3. Run specialists (bounded concurrency, then optional validated dependencies).
  const planned = plan.agents;
  const scheduled = new Set<string>(planned);
  const specialistResults = new Map<string, SpecialistResult>();

  while (scheduled.size > 0) {
    const batch = [...scheduled].filter((agentId) => !specialistResults.has(agentId));
    scheduled.clear();

    if (batch.length === 0) break;

    for (let index = 0; index < batch.length; index += config.maxConcurrentSpecialists) {
      assertRunning();
      const slice = batch.slice(index, index + config.maxConcurrentSpecialists);
      const results = await Promise.all(
        slice.map(async (agentId) => {
          counters.specialists += 1;
          if (counters.specialists > config.maxSpecialistInvocations) {
            throw new AiControllerError(
              "budget_exceeded",
              "The assistant reached its specialist limit for this request.",
            );
          }
          const agent = enabledAgents.find((candidate) => candidate.id === agentId);
          if (!agent) return null;
          return runSpecialist(agent, toolContext, userMessage, modelClient, config, abortSignal, assertRunning, record);
        }),
      );

      for (const item of results) {
        if (!item) continue;
        const validated = validateSpecialistResult(item.result, evidence);
        specialistResults.set(item.agentId, validated);

        for (const dependency of validated.dependency_requests) {
          if (
            enabledAgents.some((agent) => agent.id === dependency.agent && agent.id !== ORCHESTRATOR_AGENT_ID) &&
            !specialistResults.has(dependency.agent)
          ) {
            scheduled.add(dependency.agent);
          }
        }
      }
    }
  }

  // 4. Final synthesis.
  const sourceList = [...specialistResults.values()].flatMap((result) =>
    result.facts
      .map((fact) => evidence.toReference(fact.id))
      .filter((reference): reference is NonNullable<typeof reference> => reference !== null),
  );

  const synthesisResult = await generateWithRepair<AssistantAnswer>({
    schema: assistantAnswerSchema,
    instructions: `${SOUL}\n\n${ORCHESTRATOR_INSTRUCTIONS}\n\n${synthesisInstructions()}`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          request: userMessage,
          specialist_results: [...specialistResults.values()].map((result) =>
            sanitizeSpecialistForSynthesis(result, evidence),
          ),
          available_sources: sourceList,
        }),
      },
    ],
    maxSteps: 1,
  });
  record(synthesisResult);

  const answer = finalizeAnswer(synthesisResult.object, evidence);

  return {
    answer,
    usage: {
      inputTokens: counters.inputTokens,
      outputTokens: counters.outputTokens,
      totalTokens: counters.inputTokens + counters.outputTokens,
    },
    modelCalls: counters.modelCalls,
    toolCalls: counters.toolCalls,
    specialistInvocations: counters.specialists,
    steps: allSteps,
  };
}

async function runSpecialist(
  agent: EffectiveAgentAccess,
  toolContext: AiToolContext,
  userMessage: string,
  modelClient: ModelClient,
  config: AiServerConfig,
  abortSignal: AbortSignal | undefined,
  assertRunning: () => void,
  record: (result: { steps: ModelStep[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void,
) {
  const manifest = agentById(agent.id);
  if (!manifest) return null;
  const skills = manifest.skillIds.map((id) => skillById(id)).filter((skill) => skill !== null);
  const tools = agentToolDefinitions(agent, toolContext);

  assertRunning();
  let result;
  try {
    result = await modelClient.generateStructured<SpecialistResult>({
      schema: specialistResultSchema,
      instructions: specialistInstructions(manifest, skills),
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps: Math.max(1, Math.min(4, config.maxModelCalls)),
      abortSignal,
    });
  } catch (error) {
    if (error instanceof AiControllerError) throw error;
    result = await modelClient.generateStructured<SpecialistResult>({
      schema: specialistResultSchema,
      instructions: `${specialistInstructions(manifest, skills)}\n\nReturn valid JSON matching the schema exactly.`,
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps: Math.max(1, Math.min(4, config.maxModelCalls)),
      abortSignal,
    });
  }

  record(result);
  return { agentId: agent.id, result: result.object };
}

export function validateSpecialistResult(result: SpecialistResult, evidence: EvidenceRegistry): SpecialistResult {
  const warnings = [...result.warnings];
  const facts = result.facts.filter((fact) => {
    if (!evidence.resolve(fact.id)) {
      warnings.push(`Dropped a fact referencing an unknown source id (${fact.id}).`);
      return false;
    }
    return true;
  });

  return { ...result, facts, warnings };
}

export function finalizeAnswer(answer: AssistantAnswer, evidence: EvidenceRegistry): AssistantAnswer {
  const sources = answer.sources
    .map((source) => evidence.toReference(source.id))
    .filter((reference): reference is NonNullable<typeof reference> => reference !== null);
  const warnings = [...answer.warnings];
  for (const source of answer.sources) {
    if (!evidence.resolve(source.id)) {
      warnings.push(`Dropped an unknown source reference (${source.id}).`);
    }
  }

  const drafts = answer.drafts.map((draft) => ({
    ...draft,
    id: `draft_${draft.kind}_${draft.title}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
    status: "proposed",
  }));

  return {
    ...answer,
    sources: [...new Map(sources.map((source) => [source.id, source])).values()],
    drafts,
    missingInformation: answer.missingInformation,
    warnings: [...new Set(warnings)],
    dataTimestamp: nowIso(),
  };
}

async function runDirectTools(
  toolIds: readonly string[],
  userMessage: string,
  toolContext: AiToolContext,
  evidence: EvidenceRegistry,
  counters: { toolCalls: number },
  config: AiServerConfig,
  abortSignal: AbortSignal | undefined,
  startedAt: number,
): Promise<AssistantAnswer> {
  const results: unknown[] = [];

  for (const toolId of toolIds) {
    if (abortSignal?.aborted || Date.now() - startedAt > config.wallTimeMs) {
      throw new AiControllerError("timeout", "The assistant ran out of interactive time.");
    }
    const definition = aiTools[toolId as keyof typeof aiTools];
    if (!definition) continue;
    const output = await definition.execute({ query: userMessage, maxResults: 5 }, toolContext);
    counters.toolCalls += 1;
    if (counters.toolCalls > config.maxToolCalls) {
      throw new AiControllerError("budget_exceeded", "The assistant reached its tool-call limit.");
    }
    results.push(output);
  }

  const sources: AssistantAnswer["sources"] = [];
  const searchResult = results[0] as { status: string; data?: { results?: { sourceId: string; title: string }[]; note?: string } } | undefined;
  const matches = searchResult?.data?.results ?? [];

  for (const match of matches) {
    const reference = evidence.toReference(match.sourceId);
    if (reference) sources.push(reference);
  }

  const answerText =
    matches.length === 0
      ? (searchResult?.data?.note ?? "No published approved knowledge matched.")
      : matches
          .map((match, index) => `${index + 1}. ${match.title}`)
          .join("\n");

  return {
    answer: answerText,
    activity: ["Searched approved knowledge"],
    sources,
    drafts: [],
    missingInformation: [],
    warnings: [],
    dataTimestamp: nowIso(),
  };
}
