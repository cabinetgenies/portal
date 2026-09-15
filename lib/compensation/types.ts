/**
 * Vocabulary for the compensation domain.
 *
 * Cabinet Genies has exactly one primary Sales Designer per job and does not
 * split commissions. A Sales Manager is compensated later by a *separate* bonus
 * or override on qualifying jobs produced by the team they manage — never by a
 * share of a designer's commission. The names below keep that distinction
 * explicit; see docs/compensation-architecture.md.
 */

export const PARTICIPANT_KINDS = ["sales_designer", "sales_manager"] as const;

export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export const PARTICIPANT_KIND_LABELS: Record<ParticipantKind, string> = {
  sales_designer: "Sales designer",
  sales_manager: "Sales manager",
};

export const PARTICIPANT_KIND_NOTES: Record<ParticipantKind, string> = {
  sales_designer:
    "Commission on the jobs this person designs, based on job gross profit.",
  sales_manager:
    "Reserved: a separate bonus or override on qualifying jobs produced by the team this person manages. Not calculated, approved or paid in this phase.",
};

/** Participant kinds the portal can actually configure and evaluate today. */
export const IMPLEMENTED_PARTICIPANT_KINDS: readonly ParticipantKind[] = [
  "sales_designer",
];

export function isParticipantKind(value: unknown): value is ParticipantKind {
  return (
    typeof value === "string" &&
    (PARTICIPANT_KINDS as readonly string[]).includes(value)
  );
}

export function participantKindLabel(value: string | null | undefined) {
  return isParticipantKind(value) ? PARTICIPANT_KIND_LABELS[value] : "Unknown";
}

export function isParticipantKindImplemented(value: string | null | undefined) {
  return isParticipantKind(value) && IMPLEMENTED_PARTICIPANT_KINDS.includes(value);
}

/**
 * Plan types describe the *shape* of the rule, independently of who it
 * compensates. Manager shapes (override, threshold bonus, volume bonus) are
 * reserved for the phase that implements them, so no plan can be configured with
 * a rule the system cannot evaluate.
 */
export const COMPENSATION_PLAN_TYPES = ["straight_gp"] as const;

export type CompensationPlanType = (typeof COMPENSATION_PLAN_TYPES)[number];

export const COMPENSATION_PLAN_TYPE_LABELS: Record<CompensationPlanType, string> = {
  straight_gp: "Straight gross profit (GP bands)",
};

export function isCompensationPlanType(value: unknown): value is CompensationPlanType {
  return (
    typeof value === "string" &&
    (COMPENSATION_PLAN_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Reserved vocabulary for the payout events a later phase will record. Nothing
 * writes or reads these yet — they exist so the terminology is settled before
 * any designer payout history is produced.
 */
export const COMPENSATION_EVENT_TYPES = [
  {
    code: "designer_job_commission",
    participantKind: "sales_designer",
    description:
      "Commission earned by the sales designer on a job they designed. Implemented in a later phase.",
  },
  {
    code: "manager_team_bonus",
    participantKind: "sales_manager",
    description:
      "Bonus or override earned by a sales manager on qualifying jobs produced by their team. Reserved; never a share of a designer's commission event.",
  },
] as const satisfies readonly {
  code: string;
  participantKind: ParticipantKind;
  description: string;
}[];

export type CompensationEventTypeCode =
  (typeof COMPENSATION_EVENT_TYPES)[number]["code"];

export const THRESHOLD_TYPES = ["fixed", "project_minimum"] as const;

export type ThresholdType = (typeof THRESHOLD_TYPES)[number];

export const THRESHOLD_TYPE_LABELS: Record<ThresholdType, string> = {
  fixed: "Fixed percentage",
  project_minimum: "Project minimum GP standard",
};

/** What a person must be eligible for before a plan can be assigned. */
export type CompensationEligibility = {
  compensationEligible: boolean;
};
