import { failureState, type ActionState } from "@/lib/forms/action-state";

export type MutationContext =
  | "category"
  | "plan"
  | "version"
  | "tier"
  | "assignment"
  | "settings"
  | "reporting"
  | "job"
  | "adjustment"
  | "commission_event"
  | "draw"
  | "rollover";

/**
 * Turns database constraint failures into something a person can act on.
 * Messages describe the rule, never the SQL.
 */
export function mutationErrorState(
  error: { code?: string; message: string },
  context: MutationContext,
): ActionState {
  switch (error.code) {
    case "23505":
      return failureState(
        context === "category"
          ? "Another category already uses that code."
          : context === "plan"
            ? "A compensation plan with that name already exists."
            : context === "version"
              ? "That plan already has a version with this name."
              : context === "tier"
                ? "Another tier in this version already uses that evaluation order."
                : "A record with those details already exists.",
      );
    case "23P01":
      return failureState(
        context === "version"
          ? "Another active version of this plan already covers those dates."
          : context === "assignment"
            ? "This employee already has a plan assignment covering those dates."
            : context === "reporting"
              ? "An employee cannot report to two managers on the same day."
              : "Those dates overlap another record.",
      );
    case "23514":
    case "23503":
      return failureState(
        "Those values are not valid for this record. Check the fields and try again.",
      );
    case "42501":
      return failureState("Your role is not allowed to change this record.");
    default:
      console.error(`Mutation failed (${context}):`, error.message);
      return failureState(
        "The change could not be saved. Try again, and contact an administrator if it keeps failing.",
      );
  }
}
