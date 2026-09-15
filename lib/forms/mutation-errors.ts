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
  | "rollover"
  | "user";

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
                : context === "user"
                  ? "A portal profile with those details already exists. Check the email address, or configure the existing account in the directory."
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
        context === "user"
          ? "No Supabase Auth user matches that id. Create the user in Supabase → Authentication → Users first, then paste their id here."
          : "Those values are not valid for this record. Check the fields and try again.",
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
