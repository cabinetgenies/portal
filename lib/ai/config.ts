/**
 * Server-only AI configuration.
 *
 * Keep this module out of Client Components: it reads the provider key and
 * pricing metadata. Client code should read only the tiny `aiAvailability`
 * helper that never contains credentials.
 */

export type AiProviderName = "openai";

export type AiServerConfig = {
  provider: AiProviderName;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
  /** Optional cost metadata in USD per 1M tokens. Used only for estimates. */
  inputCostPerMtok: number | null;
  outputCostPerMtok: number | null;
  dailyQuota: number;
  wallTimeMs: number;
  maxSpecialistInvocations: number;
  maxConcurrentSpecialists: number;
  maxModelCalls: number;
  maxToolCalls: number;
};

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nullableNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getAiServerConfig(): AiServerConfig {
  return {
    provider: "openai",
    model: (process.env.AI_MODEL ?? "").trim() || "gpt-5-mini",
    apiKey: (process.env.AI_API_KEY ?? "").trim() || null,
    baseUrl: (process.env.AI_BASE_URL ?? "").trim() || null,
    inputCostPerMtok: nullableNumber(process.env.AI_INPUT_COST_PER_MTOK),
    outputCostPerMtok: nullableNumber(process.env.AI_OUTPUT_COST_PER_MTOK),
    dailyQuota: positiveInt(process.env.AI_DAILY_QUOTA, 50),
    wallTimeMs: positiveInt(process.env.AI_WALL_TIME_MS, 45_000),
    maxSpecialistInvocations: positiveInt(process.env.AI_MAX_SPECIALISTS, 4),
    maxConcurrentSpecialists: positiveInt(process.env.AI_MAX_CONCURRENT_SPECIALISTS, 2),
    maxModelCalls: positiveInt(process.env.AI_MAX_MODEL_CALLS, 12),
    maxToolCalls: positiveInt(process.env.AI_MAX_TOOL_CALLS, 20),
  };
}

/** Whether a provider model is configured well enough to attempt a real call. */
export function isAiConfigured() {
  const config = getAiServerConfig();
  return config.model.length > 0 && config.apiKey !== null;
}

/**
 * The safe, credential-free availability signal for server components and
 * route handlers that need to render a notice before a call is attempted.
 */
export function aiAvailability() {
  const config = getAiServerConfig();
  return {
    configured: isAiConfigured(),
    model: config.model,
    provider: config.provider,
  };
}

