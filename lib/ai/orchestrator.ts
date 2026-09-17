import {
  assistantAnswerSchema,
  type AssistantAnswer,
  type SpecialistResult,
} from "@/lib/ai/schema";
import type { AiServerConfig } from "@/lib/ai/config";
import { EvidenceRegistry } from "@/lib/ai/evidence";
import { ORCHESTRATOR_INSTRUCTIONS, SOUL } from "@/lib/ai/instructions";
import type { ModelClient, ModelStep, ModelToolDefinition } from "@/lib/ai/model";
import { ORCHESTRATOR_AGENT_ID } from "@/lib/ai/registry";
import { aiTools, type AiToolContext } from "@/lib/ai/tools";
import type { AuthorizedSession } from "@/lib/auth/dal";
import type { EffectiveAgentAccess } from "@/lib/ai/access";

/**
 * The bounded, permission-aware Ask BOS controller.
 *
 * Human -> authenticated session -> authorized context -> one assistant ->
 * approved read-only tools -> validated structured answer -> human.
 *
 * Multi-agent delegation is intentionally deferred. The current BOS assistant is
 * one logical model with one reviewed tool set. RLS and server-side capability
 * checks remain authoritative for every data read.
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

function assertWithinWallTime(
  startedAt: number,
  wallTimeMs: number,
  abortSignal?: AbortSignal,
) {
  if (abortSignal?.aborted) {
    throw new AiControllerError("timeout", "The request was cancelled.");
  }
  if (Date.now() - startedAt > wallTimeMs) {
    throw new AiControllerError("timeout", "The assistant ran out of interactive time.");
  }
}

function askBosToolDefinitions(
  agent: EffectiveAgentAccess,
  ctx: AiToolContext,
  config: AiServerConfig,
  startedAt: number,
  abortSignal?: AbortSignal,
) {
  const tools: Record<string, ModelToolDefinition> = {};
  const perToolCalls = new Map<string, number>();
  let totalToolCalls = 0;

  for (const toolId of agent.allowedToolIds) {
    const definition = aiTools[toolId as keyof typeof aiTools];
    if (!definition) continue;

    tools[toolId] = {
      name: toolId,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: async (input) => {
        assertWithinWallTime(startedAt, config.wallTimeMs, abortSignal);

        const nextTotal = totalToolCalls + 1;
        if (nextTotal > config.maxToolCalls) {
          throw new AiControllerError(
            "budget_exceeded",
            "The assistant reached its tool-call limit for this request.",
          );
        }

        const currentForTool = perToolCalls.get(toolId) ?? 0;
        const toolLimit = agent.toolLimits[toolId];
        if (toolLimit !== undefined && currentForTool + 1 > toolLimit) {
          throw new AiControllerError(
            "budget_exceeded",
            `The assistant reached the ${toolId} limit for this request.`,
          );
        }

        totalToolCalls = nextTotal;
        perToolCalls.set(toolId, currentForTool + 1);
        return definition.execute(input, ctx);
      },
    };
  }

  return {
    tools,
    getToolCallCount: () => totalToolCalls,
  };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { session, agents, config, userMessage, modelClient, abortSignal } = input;
  const startedAt = Date.now();
  const evidence = new EvidenceRegistry();
  const askBos = agents.find(
    (agent) => agent.id === ORCHESTRATOR_AGENT_ID && agent.enabled,
  );

  if (!askBos) {
    throw new AiControllerError("not_authorized", "Ask BOS is not enabled for your role.");
  }

  const toolContext: AiToolContext = { session, evidence };
  const { tools, getToolCallCount } = askBosToolDefinitions(
    askBos,
    toolContext,
    config,
    startedAt,
    abortSignal,
  );

  assertWithinWallTime(startedAt, config.wallTimeMs, abortSignal);

  const modelId = askBos.modelAlias === "default" ? undefined : askBos.modelAlias;
  const maxSteps = Math.max(1, Math.min(config.maxModelCalls, 8));

  let result;
  try {
    result = await modelClient.generateStructured<AssistantAnswer>({
      schema: assistantAnswerSchema,
      instructions: `${SOUL}\n\n${ORCHESTRATOR_INSTRUCTIONS}`,
      messages: [{ role: "user", content: userMessage }],
      tools,
      maxSteps,
      modelId,
      abortSignal,
    });
  } catch (error) {
    if (error instanceof AiControllerError) throw error;
    throw new AiControllerError(
      "provider_error",
      error instanceof Error ? error.message : "The AI provider request failed.",
    );
  }

  assertWithinWallTime(startedAt, config.wallTimeMs, abortSignal);

  const modelCalls = Math.max(1, result.steps.length);
  if (modelCalls > config.maxModelCalls) {
    throw new AiControllerError(
      "budget_exceeded",
      "The assistant reached its model-call limit for this request.",
    );
  }

  const answer = finalizeAnswer(result.object, evidence);

  return {
    answer,
    usage: result.usage,
    modelCalls,
    toolCalls: getToolCallCount(),
    specialistInvocations: 0,
    steps: result.steps,
  };
}

/**
 * Retained for compatibility with existing tests and future execution-engine work.
 * The current Ask BOS runtime never invokes a specialist.
 */
export function validateSpecialistResult(
  result: SpecialistResult,
  evidence: EvidenceRegistry,
): SpecialistResult {
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

export function finalizeAnswer(
  answer: AssistantAnswer,
  evidence: EvidenceRegistry,
): AssistantAnswer {
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
    id: `draft_${draft.kind}_${draft.title}`
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80),
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
