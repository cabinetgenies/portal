import { z } from "zod";

import { resolveAiAccess, getDailyQuotaState } from "@/lib/ai/access";
import { getSessionContext, type AuthorizedSession } from "@/lib/auth/dal";
import { getAiServerConfig, isAiConfigured } from "@/lib/ai/config";
import { VercelModelClient } from "@/lib/ai/model";
import { AiControllerError, runOrchestrator } from "@/lib/ai/orchestrator";
import { ORCHESTRATOR_AGENT_ID } from "@/lib/ai/registry";
import {
  answerAsText,
  createConversation,
  createRun,
  getOwnedConversation,
  insertMessage,
  persistToolRunSteps,
  updateRun,
} from "@/lib/ai/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().min(1).optional(),
});

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session || session.status !== "authorized") {
    return errorResponse(401, "not_authorized", "Sign in to use the assistant.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "message is required (at most 4000 characters).");
  }

  if (!isAiConfigured()) {
    return errorResponse(503, "not_configured", "AI is not configured. Ask an administrator to set the server model and API key.");
  }

  const access = await resolveAiAccess(session);
  if (!access.allowed) {
    return errorResponse(403, "not_authorized", access.reason ?? "The assistant is not enabled for your role.");
  }

  const quota = await getDailyQuotaState(session.userId);
  if (!quota.allowed) {
    return errorResponse(429, "quota_exceeded", "Your daily assistant quota has been reached.");
  }

  const config = getAiServerConfig();
  const modelClient = new VercelModelClient(config);
  const userId = session.userId;

  let conversationId: string;
  try {
    if (parsed.data.conversationId) {
      const owned = await getOwnedConversation(parsed.data.conversationId, userId);
      if (!owned) {
        return errorResponse(404, "not_found", "That conversation does not exist.");
      }
      conversationId = owned.id;
    } else {
      conversationId = await createConversation(userId, parsed.data.message.slice(0, 80));
    }

    await insertMessage({
      conversationId,
      role: "user",
      content: parsed.data.message,
    });
  } catch {
    return errorResponse(500, "persistence_error", "Could not store the conversation.");
  }

  let runId: string;
  try {
    runId = await createRun({
      conversationId,
      userId,
      agentId: ORCHESTRATOR_AGENT_ID,
      model: access.providerModel,
    });
  } catch {
    return errorResponse(500, "persistence_error", "Could not start the assistant run.");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.wallTimeMs);

  try {
    const result = await runOrchestrator({
      session: session as AuthorizedSession,
      agents: access.agents,
      config,
      userMessage: parsed.data.message,
      modelClient,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeout);

    await persistToolRunSteps({ runId, userId, steps: result.steps });
    const text = answerAsText(result.answer);
    await insertMessage({
      conversationId,
      role: "assistant",
      content: text,
      payload: { answer: result.answer },
    });
    await updateRun(runId, {
      status: "completed",
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      model_calls: result.modelCalls,
      tool_calls: result.toolCalls,
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      conversationId,
      runId,
      answer: result.answer,
      text,
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : "The assistant failed.";

    if (error instanceof AiControllerError) {
      await updateRun(runId, {
        status: error.code === "budget_exceeded" || error.code === "timeout" ? "cancelled" : "failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
      });

      const status =
        error.code === "budget_exceeded" || error.code === "timeout"
          ? 408
          : error.code === "provider_error"
            ? 502
            : 400;
      return errorResponse(status, error.code, error.message);
    }

    await updateRun(runId, {
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    return errorResponse(502, "provider_error", "The assistant could not complete this request.");
  }
}
