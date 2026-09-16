import { generateText, isStepCount, Output, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";

import { getAiServerConfig, type AiServerConfig } from "@/lib/ai/config";

/**
 * A small model adapter.
 *
 * The orchestrator depends on this interface, not on the Vercel AI SDK directly,
 * so the bounded controller and schema validation can be tested with a scripted
 * fake while production uses the Vercel adapter. Tools execute with a
 * server-bound context that is assembled per request and never supplied by the
 * model.
 */

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown, context: unknown) => Promise<unknown>;
};

export type ModelStep = {
  text: string;
  toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
  toolResults: {
    toolCallId: string;
    toolName: string;
    output: unknown;
    isError: boolean;
  }[];
};

export type ModelStructuredResult<T> = {
  object: T;
  text: string;
  usage: AiUsage;
  steps: ModelStep[];
};

export type GenerateStructuredInput<T> = {
  schema: z.ZodType<T>;
  instructions: string;
  messages: ModelMessage[];
  tools?: Record<string, ModelToolDefinition>;
  maxSteps?: number;
  modelId?: string;
  abortSignal?: AbortSignal;
};

export interface ModelClient {
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<ModelStructuredResult<T>>;
}

function normalizeUsage(usage: unknown): AiUsage {
  const value = (usage ?? {}) as {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  return {
    inputTokens: Number(value.inputTokens ?? 0),
    outputTokens: Number(value.outputTokens ?? 0),
    totalTokens: Number(value.totalTokens ?? 0),
  };
}

/** The Vercel AI SDK / OpenAI adapter used by the application. */
export class VercelModelClient implements ModelClient {
  private readonly config: AiServerConfig;

  constructor(config: AiServerConfig = getAiServerConfig()) {
    this.config = config;
  }

  private resolveModel(modelId?: string) {
    const provider = createOpenAI({
      apiKey: this.config.apiKey ?? undefined,
      baseURL: this.config.baseUrl ?? undefined,
    });
    return provider(modelId || this.config.model);
  }

  async generateStructured<T>({
    schema,
    instructions,
    messages,
    tools,
    maxSteps = 4,
    modelId,
    abortSignal,
  }: GenerateStructuredInput<T>): Promise<ModelStructuredResult<T>> {
    const aiTools = tools
      ? Object.fromEntries(
          Object.entries(tools).map(([name, definition]) => [
            name,
            tool({
              description: definition.description,
              inputSchema: definition.inputSchema,
              execute: async (args: unknown) => definition.execute(args, { aiSdk: true }),
            }),
          ]),
        )
      : undefined;

    const result = await generateText({
      model: this.resolveModel(modelId),
      instructions,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      tools: aiTools,
      output: Output.object({ schema }),
      stopWhen: isStepCount(maxSteps),
      abortSignal,
    });

    const steps: ModelStep[] = (result.steps ?? []).map((step) => ({
      text: step.text ?? "",
      toolCalls: (step.toolCalls ?? []).map((call) => ({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      })),
      toolResults: (step.toolResults ?? []).map((item) => {
        const loose = item as {
          type?: string;
          toolCallId: string;
          toolName: string;
          output?: unknown;
          error?: unknown;
        };
        return {
          toolCallId: loose.toolCallId,
          toolName: loose.toolName,
          output: loose.type === "tool-error" ? loose.error : loose.output,
          isError: loose.type === "tool-error",
        };
      }),
    }));

    return {
      object: result.output as T,
      text: result.text ?? "",
      usage: normalizeUsage(result.usage),
      steps,
    };
  }
}
