import { z } from "zod";

/**
 * Phase 7A assistant result contracts.
 *
 * These schemas are the only shapes the orchestrator trusts from a model. The
 * model can propose a shape, but the controller parses it with Zod and rejects
 * or repairs anything that does not match. Source ids are minted by the server's
 * evidence registry — never by the model — and are revalidated after the model
 * returns them.
 */

export const SPECIALIST_STATUSES = [
  "complete",
  "needs_information",
  "needs_dependency",
  "blocked",
  "failed",
] as const;

export const SENSITIVITY_LEVELS = [
  "public",
  "internal",
  "financial",
  "personal",
  "confidential",
] as const;

export const sourceFactSchema = z.object({
  /** A server-issued evidence id from this run's evidence registry. */
  id: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  sensitivity: z.enum(SENSITIVITY_LEVELS),
});

export const sourceReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  recordType: z.string().min(1),
  recordId: z.string().min(1),
  version: z.string().nullable(),
  retrievedAt: z.string().min(1),
  sensitivity: z.enum(SENSITIVITY_LEVELS),
});

export const dependencyRequestSchema = z.object({
  agent: z.string().min(1),
  reason: z.string().min(1),
});

export const proposedActionSchema = z.object({
  actionId: z.string().min(1),
  kind: z.enum(["explain", "draft"]),
  summary: z.string().min(1),
});

export const artifactReferenceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
});

export const specialistResultSchema = z.object({
  status: z.enum(SPECIALIST_STATUSES),
  summary: z.string().min(1),
  facts: z.array(sourceFactSchema).max(30),
  assumptions: z.array(z.string().min(1)).max(20),
  missing_information: z.array(z.string().min(1)).max(20),
  dependency_requests: z.array(dependencyRequestSchema).max(5),
  proposed_actions: z.array(proposedActionSchema).max(10),
  warnings: z.array(z.string().min(1)).max(20),
  artifact_references: z.array(artifactReferenceSchema).max(10),
});

export type SpecialistResult = z.infer<typeof specialistResultSchema>;
export type SourceFact = z.infer<typeof sourceFactSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;

/**
 * The orchestrator's plan for one request. `agents` and `direct_tools` are both
 * bounded by the controller, not by this schema alone.
 */
export const runPlanSchema = z.object({
  agents: z.array(z.string().min(1)).max(4),
  direct_tools: z.array(z.string().min(1)).max(4),
  rationale: z.string().min(1),
});

export type RunPlan = z.infer<typeof runPlanSchema>;

export const draftReferenceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  subject: z.string().nullable(),
  body: z.string().min(1),
});

/** The final human-facing answer the orchestrator returns. */
export const assistantAnswerSchema = z.object({
  answer: z.string().min(1),
  activity: z.array(z.string().min(1)).max(12),
  sources: z.array(sourceReferenceSchema).max(20),
  drafts: z.array(draftReferenceSchema).max(10),
  missingInformation: z.array(z.string().min(1)).max(20),
  warnings: z.array(z.string().min(1)).max(20),
  dataTimestamp: z.string().min(1),
});

export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;
