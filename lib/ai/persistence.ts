import { createHash } from "node:crypto";

import type { AssistantAnswer } from "@/lib/ai/schema";
import type { ModelStep } from "@/lib/ai/model";
import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Private assistant persistence.
 *
 * All writes use the request-scoped user client, so Row Level Security still
 * decides who can create and read these rows. Raw transcripts stay in
 * `ai_messages`; `ai_runs` holds only operating metadata.
 */

export function hashArtifact(content: unknown, version: number) {
  return createHash("sha256")
    .update(`${version}:${JSON.stringify(content)}`)
    .digest("hex");
}

export async function createConversation(userId: string, title: string | null) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create conversation: ${error.message}`);
  return data.id;
}

export async function getOwnedConversation(conversationId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not read conversation: ${error.message}`);
  return data;
}

export async function insertMessage({
  conversationId,
  role,
  content,
  payload = {},
}: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role, content, payload: payload as Json })
    .select("id")
    .single();

  if (error) throw new Error(`Could not store message: ${error.message}`);
  return data.id;
}

export async function createRun({
  conversationId,
  userId,
  agentId,
  model,
}: {
  conversationId: string;
  userId: string;
  agentId: string;
  model: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_runs")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      agent_id: agentId,
      model,
      status: "running",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create run: ${error.message}`);
  return data.id;
}

export async function updateRun(
  runId: string,
  patch: {
    status?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model_calls?: number;
    tool_calls?: number;
    error_message?: string | null;
    completed_at?: string | null;
  },
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ai_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`Could not update run: ${error.message}`);
}

export async function insertRunStep({
  runId,
  userId,
  sequence,
  agentId,
  kind,
  input,
  output,
  status = "completed",
  errorMessage = null,
}: {
  runId: string;
  userId: string;
  sequence: number;
  agentId: string | null;
  kind: "plan" | "specialist" | "tool" | "synthesis";
  input?: unknown;
  output?: unknown;
  status?: string;
  errorMessage?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("ai_run_steps").insert({
    run_id: runId,
    user_id: userId,
    sequence,
    agent_id: agentId,
    kind,
    input: input === undefined ? null : (input as Json),
    output: output === undefined ? null : (output as Json),
    status,
    error_message: errorMessage,
  });

  if (error) throw new Error(`Could not store run step: ${error.message}`);
}

/** Persist model tool calls as typed run-step rows. */
export async function persistToolRunSteps({
  runId,
  userId,
  steps,
}: {
  runId: string;
  userId: string;
  steps: ModelStep[];
}) {
  let sequence = 1;
  const supabase = await createSupabaseServerClient();

  for (const step of steps) {
    for (const call of step.toolCalls) {
      const result = step.toolResults.find((item) => item.toolCallId === call.toolCallId);
      const { error } = await supabase.from("ai_run_steps").insert({
        run_id: runId,
        user_id: userId,
        sequence,
        agent_id: null,
        kind: "tool",
        input: call.input as Json,
        output: (result?.output ?? null) as Json | null,
        status: result?.isError ? "failed" : "completed",
        error_message: result?.isError ? String(result.output ?? "Tool error") : null,
      });
      if (error) throw new Error(`Could not store tool run step: ${error.message}`);
      sequence += 1;
    }
  }
}

export async function saveDraftArtifact({
  userId,
  conversationId,
  runId,
  kind,
  title,
  subject,
  body,
}: {
  userId: string;
  conversationId: string | null;
  runId: string | null;
  kind: string;
  title: string;
  subject: string | null;
  body: string;
}) {
  const content = { subject, body };
  const version = 1;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_artifacts")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      run_id: runId,
      kind,
      title,
      content,
      status: "draft",
      version,
      payload_hash: hashArtifact(content, version),
      unique_execution_key: `draft:${userId}:${kind}:${hashArtifact(content, version).slice(0, 32)}`,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    })
    .select("id, status, version, unique_execution_key")
    .single();

  if (error) throw new Error(`Could not save draft: ${error.message}`);
  return data;
}

export function answerAsText(answer: AssistantAnswer) {
  const lines: string[] = [answer.answer];
  if (answer.missingInformation.length > 0) {
    lines.push("", "Missing information:", ...answer.missingInformation.map((item) => `- ${item}`));
  }
  if (answer.warnings.length > 0) {
    lines.push("", "Warnings:", ...answer.warnings.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
