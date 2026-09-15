import { getSessionContext } from "@/lib/auth/dal";
import { failureState, type ActionState } from "@/lib/forms/action-state";
import type { Capability } from "@/lib/permissions/roles";

export type Authorization = { userId: string } | { denied: ActionState };

/**
 * Server Action authorization.
 *
 * Every mutating action calls this before touching data. It returns a form-ready
 * error state rather than redirecting, and Row Level Security enforces the same
 * rule again in Postgres.
 */
export async function authorizeCapability(
  capability: Capability,
): Promise<Authorization> {
  const session = await getSessionContext();

  if (!session) {
    return {
      denied: failureState("Your session has expired. Sign in again to continue."),
    };
  }

  if (!session.capabilities.includes(capability)) {
    return { denied: failureState("Your role does not allow this change.") };
  }

  return { userId: session.userId };
}
