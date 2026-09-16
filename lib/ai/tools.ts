import { z } from "zod";

import { listKnowledgeItems } from "@/lib/knowledge/queries";
import { toNumber } from "@/lib/commission/financials";
import { calculateCommissionEvent } from "@/lib/commission/engine";
import {
  getJobCommissionContext,
  listEmployeeCommissionSummaries,
  settingsSnapshot,
  tiersForVersion,
} from "@/lib/commission/event-queries";
import {
  listMeasurables,
  listPriorities,
  listIssues,
  listActionItems,
} from "@/lib/performance/queries";
import type { EvidenceRegistry } from "@/lib/ai/evidence";
import type { AuthorizedSession } from "@/lib/auth/dal";
import type { Capability } from "@/lib/permissions/roles";
import type { KnowledgeItemRow } from "@/lib/supabase/database.types";

/**
 * Narrow, read-only, server-authorized tools for the assistant.
 *
 * Every tool runs with the signed-in user's request-scoped Supabase client, so
 * Row Level Security remains the authority. Tools never accept a capability or
 * identity from the model and never write business data.
 */

export type AiToolContext = {
  session: AuthorizedSession;
  evidence: EvidenceRegistry;
};

export type AiToolResult = {
  status: "ok" | "unavailable" | "denied";
  message?: string;
  data?: unknown;
};

function hasCapability(capabilities: readonly Capability[], required: readonly string[]) {
  return required.length === 0 || required.some((cap) => capabilities.includes(cap as Capability));
}

function knowledgeSensitivity(item: KnowledgeItemRow) {
  const title = item.title.toLowerCase();
  if (title.includes("commission") || title.includes("pay") || title.includes("salary")) {
    return "financial" as const;
  }
  if (title.includes("review") || title.includes("personnel") || title.includes("employee")) {
    return "personal" as const;
  }
  return "internal" as const;
}

function registerKnowledgeEvidence(evidence: EvidenceRegistry, item: KnowledgeItemRow) {
  return evidence.register({
    recordType: "knowledge_item",
    recordId: item.id,
    title: item.title,
    version: item.updated_at,
    sensitivity: knowledgeSensitivity(item),
  });
}

export const aiTools = {
  searchApprovedKnowledge: {
    description:
      "Search published, company-approved knowledge. Returns matching item ids, titles, types, status and a short excerpt. Use readApprovedKnowledgeItem for full content.",
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      maxResults: z.number().int().min(1).max(8).default(5),
    }),
    async execute(input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      const { query, maxResults } = input as { query: string; maxResults: number };
      const items = await listKnowledgeItems({ statuses: ["published"] });
      const needle = query.toLowerCase();

      const scored = items
        .map((item) => {
          const haystack = [item.title, item.description, item.body, ...(item.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const score = haystack.includes(needle) ? needle.length / Math.max(1, haystack.length) : 0;
          return { item, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      if (scored.length === 0) {
        return { status: "ok", data: { results: [], note: "No published approved knowledge matched." } };
      }

      const results = scored.map(({ item }) => {
        const evidence = registerKnowledgeEvidence(ctx.evidence, item);
        return {
          sourceId: evidence.id,
          id: item.id,
          title: item.title,
          type: item.type,
          status: item.status,
          departmentId: item.department_id,
          businessRoleId: item.business_role_id,
          excerpt: (item.description ?? item.body ?? "").slice(0, 500),
        };
      });

      return { status: "ok", data: { results } };
    },
  },

  readApprovedKnowledgeItem: {
    description: "Read one published knowledge item by id and return its full approved content.",
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    async execute(input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      const { id } = input as { id: string };
      const items = await listKnowledgeItems({ statuses: ["published"] });
      const item = items.find((candidate) => candidate.id === id);

      if (!item) {
        return {
          status: "unavailable",
          message: "The requested knowledge item is not published or not available to you.",
        };
      }

      const evidence = registerKnowledgeEvidence(ctx.evidence, item);
      return {
        status: "ok",
        data: {
          sourceId: evidence.id,
          id: item.id,
          title: item.title,
          type: item.type,
          status: item.status,
          updatedAt: item.updated_at,
          body: item.body ?? "",
        },
      };
    },
  },

  getMyCommissionSummary: {
    description: "Return the signed-in employee's own commission summary.",
    inputSchema: z.object({}),
    async execute(_input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      if (!hasCapability(ctx.session.capabilities, ["view:own-commission"])) {
        return { status: "denied", message: "Your role cannot read commission data." };
      }

      const summaries = await listEmployeeCommissionSummaries();
      const mine = summaries.find((summary) => summary.profile.id === ctx.session.userId) ?? null;

      if (!mine) {
        return { status: "ok", data: { summary: null, note: "No commission record yet." } };
      }

      for (const event of mine.events) {
        ctx.evidence.register({
          recordType: "commission_event",
          recordId: event.id,
          title: `Commission event ${event.event_type}`,
          version: event.updated_at,
          sensitivity: "financial",
        });
      }

      return {
        status: "ok",
        data: {
          summary: {
            onDraw: mine.onDraw,
            drawBalance: mine.drawBalance,
            rolloverBalance: mine.rolloverBalance,
            projectedCommission: mine.projectedCommission,
            pendingApproval: mine.pendingApproval,
            approvedUnpaid: mine.approvedUnpaid,
            paidYtd: mine.paidYtd,
            events: mine.events.map((event) => ({
              id: event.id,
              eventType: event.event_type,
              status: event.status,
              grossCommission: toNumber(event.gross_commission),
              netPayable: toNumber(event.net_payable),
              drawOffset: toNumber(event.draw_offset),
              rolloverOffset: toNumber(event.rollover_offset),
              approvedAt: event.approved_at,
              paidAt: event.paid_at,
            })),
          },
          caveat: "Settlement balances affected by draw or rollover offsets are not verified by this assistant.",
        },
      };
    },
  },

  getProjectCommissionContext: {
    description:
      "Return a permitted project's assigned plan, events and projected/approved/paid commission context.",
    inputSchema: z.object({
      projectId: z.string().min(1),
    }),
    async execute(input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      if (
        !hasCapability(ctx.session.capabilities, [
          "view:financials",
          "view:own-commission",
          "calculate:commission",
        ])
      ) {
        return { status: "denied", message: "Your role cannot read commission data." };
      }

      const { projectId } = input as { projectId: string };
      const context = await getJobCommissionContext(projectId);

      if (!context) {
        return { status: "unavailable", message: "That project is not available to you." };
      }

      const { job } = context.detail;
      ctx.evidence.register({
        recordType: "project",
        recordId: job.id,
        title: job.job_name,
        version: job.updated_at,
        sensitivity: "financial",
      });
      if (context.detail.planVersion) {
        ctx.evidence.register({
          recordType: "compensation_plan_version",
          recordId: context.detail.planVersion.id,
          title: `${context.detail.plan?.name ?? "Plan"} ${context.detail.planVersion.version_name}`,
          version: context.detail.planVersion.version_name,
          sensitivity: "financial",
        });
      }
      for (const event of context.events) {
        ctx.evidence.register({
          recordType: "commission_event",
          recordId: event.id,
          title: `Commission event ${event.event_type}`,
          version: event.updated_at,
          sensitivity: "financial",
        });
      }

      const approvedGross = context.events
        .filter((event) => event.status === "approved" || event.status === "paid")
        .reduce((total, event) => total + toNumber(event.gross_commission), 0);
      const paidNet = context.events
        .filter((event) => event.status === "paid")
        .reduce((total, event) => total + toNumber(event.net_payable), 0);

      return {
        status: "ok",
        data: {
          project: {
            id: job.id,
            jobNumber: job.job_number,
            name: job.job_name,
            status: job.status,
            planName: context.detail.plan?.name ?? null,
            planVersionName: context.detail.planVersion?.version_name ?? null,
            commissionableGp: toNumber(job.commissionable_gross_profit),
            commissionableGpPercent: toNumber(job.commissionable_gp_percent),
          },
          projection: context.projected
            ? {
                tierLabel: context.projected.tier?.label ?? null,
                standardRate: context.projected.standardRate,
                effectiveRate: context.projected.effectiveRate,
                jobGrossCommission: context.projected.jobGrossCommission,
                depositCommission: context.projected.grossCommission,
              }
            : null,
          balances: {
            onDraw: context.onDraw,
            drawBalance: context.drawBalance,
            rolloverBalance: context.rolloverBalance,
          },
          recognized: {
            previouslyRecognized: context.previouslyRecognized,
            approvedGross,
            paidNet,
            caveat:
              "previouslyRecognized sums net payable, which excludes amounts credited to draw or rollover; settlement balances are not verified here.",
          },
          events: context.events.map((event) => ({
            id: event.id,
            eventType: event.event_type,
            status: event.status,
            grossCommission: toNumber(event.gross_commission),
            netPayable: toNumber(event.net_payable),
            drawOffset: toNumber(event.draw_offset),
            rolloverOffset: toNumber(event.rollover_offset),
            approvedAt: event.approved_at,
            paidAt: event.paid_at,
          })),
        },
      };
    },
  },

  previewCommissionScenario: {
    description:
      "Run an isolated, transient what-if commission calculation using the project's assigned plan. Never updates the project.",
    inputSchema: z.object({
      projectId: z.string().min(1),
      commissionableGp: z.number(),
      commissionableGpPercent: z.number(),
    }),
    async execute(input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      if (!hasCapability(ctx.session.capabilities, ["view:financials", "calculate:commission"])) {
        return { status: "denied", message: "Your role cannot run commission calculations." };
      }

      const { projectId, commissionableGp, commissionableGpPercent } = input as {
        projectId: string;
        commissionableGp: number;
        commissionableGpPercent: number;
      };
      const context = await getJobCommissionContext(projectId);

      if (!context || !context.detail.planVersion) {
        return {
          status: "unavailable",
          message: "That project is not available or has no assigned plan version.",
        };
      }

      const workspaceTiers = tiersForVersion(
        { planTiers: context.detail.planVersionTiers },
        context.detail.planVersion.id,
      );
      const calculation = calculateCommissionEvent({
        jobId: projectId,
        profileId: context.detail.job.sales_designer_id ?? "",
        eventType: "deposit",
        stage: "projected",
        commissionableGp,
        commissionableGpPercent,
        tiers: workspaceTiers,
        minimumGpStandard: 0,
        plan: {
          planId: context.detail.plan?.id ?? "",
          planVersionId: context.detail.planVersion.id,
          versionName: context.detail.planVersion.version_name ?? null,
        },
        settings: settingsSnapshot(context.settings),
        onDraw: context.onDraw,
        outstandingRollover: context.rolloverBalance,
        outstandingDraw: context.drawBalance,
        previouslyRecognized: context.previouslyRecognized,
      });

      return {
        status: "ok",
        data: {
          transient: true,
          inputs: { commissionableGp, commissionableGpPercent },
          result: {
            tierLabel: calculation.tier?.label ?? null,
            standardRate: calculation.standardRate,
            effectiveRate: calculation.effectiveRate,
            jobGrossCommission: calculation.jobGrossCommission,
            depositCommission: calculation.grossCommission,
            drawOffset: calculation.drawOffset,
            rolloverOffset: calculation.rolloverOffset,
            netPayable: calculation.netPayable,
          },
          caveat:
            "This is a transient what-if and does not update the project, events, ledgers or audit history.",
        },
      };
    },
  },

  getLeadershipMeetingContext: {
    description:
      "Return authorized Phase 6 scorecards, priorities, issues and actions for a meeting brief. Missing values remain missing.",
    inputSchema: z.object({
      departmentId: z.string().min(1).optional(),
    }),
    async execute(_input: unknown, ctx: AiToolContext): Promise<AiToolResult> {
      if (
        !hasCapability(ctx.session.capabilities, [
          "view:performance-own",
          "view:performance-team",
          "view:performance-all",
        ])
      ) {
        return { status: "denied", message: "Your role cannot read leadership data." };
      }

      const [measurables, priorities, issues, actions] = await Promise.all([
        listMeasurables(),
        listPriorities(),
        listIssues(),
        listActionItems(),
      ]);

      return {
        status: "ok",
        data: {
          note:
            "Only rows Row Level Security allowed the current user to read are included. Missing entries are missing, not zero.",
          measurables: measurables.map((row) => ({
            id: row.id,
            name: row.name,
            scope: row.scope,
            status: row.status,
            currentValue: row.current_value,
            target: row.target,
          })),
          priorities: priorities.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            percentComplete: row.percent_complete,
            dueDate: row.due_date,
          })),
          issues: issues.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
          })),
          actions: actions.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            dueDate: row.due_date,
          })),
        },
      };
    },
  },
} as const;

export type AiToolId = keyof typeof aiTools;

