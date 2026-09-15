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

  // Authenticated is not authorized: an account whose profile is missing or
  // inactive holds no capabilities, and a Server Action is refused outright
  // rather than being told which capability it lacked.
  if (session.status !== "authorized") {
    return {
      denied: failureState(
        "Your account does not have access to the portal. Ask an administrator to activate your profile.",
      ),
    };
  }

  if (!session.capabilities.includes(capability)) {
    return { denied: failureState("Your role does not allow this change.") };
  }

  return { userId: session.userId };
}
