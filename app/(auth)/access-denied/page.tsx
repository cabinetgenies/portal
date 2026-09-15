import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { AlertIcon, LockIcon } from "@/components/icons";
import { accessDenialCopy } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/dal";
import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from "@/lib/auth/routes";

export const metadata = {
  title: "No access",
};

/** Session-dependent, so it is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * Where an authenticated person lands when the portal will not let them in.
 *
 * This page exists because the honest answer to "Google let me in, why can't I
 * see anything?" needs somewhere to be given. It sits outside the authenticated
 * shell, renders no portal data, and shows only two things: the person's own
 * signed-in address, and the way to end the session.
 *
 * It is not a protected route, so it also has to refuse to be one: a person who
 * *is* authorized is sent on to the portal, and a person with no session is sent
 * to sign in.
 */
export default async function AccessDeniedPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect(LOGIN_ROUTE);
  }

  if (session.status === "authorized") {
    redirect(DEFAULT_AUTHENTICATED_ROUTE);
  }

  const copy = accessDenialCopy(session.reason);

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
            CG
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">
            Cabinet Genies Portal
          </span>
        </div>

        <div
          role="alert"
          className="space-y-3 rounded-xl border border-line bg-surface p-5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
            <AlertIcon className="h-5 w-5" />
          </span>
          <h1 className="text-lg leading-7 font-semibold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="text-sm leading-6 text-ink-muted">{copy.description}</p>
          <p className="text-sm leading-6 text-ink-muted">{copy.guidance}</p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-5">
          <LockIcon className="mt-0.5 h-4 w-4 text-ink-subtle" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">You are signed in as</p>
            <p className="text-sm break-all text-ink-muted">
              {session.email ?? "an account without an email address"}
            </p>
            <p className="text-xs leading-5 text-ink-subtle">
              Give this address to an administrator so they can find the right profile.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <SignOutButton />
          <p className="text-xs leading-5 text-ink-subtle">
            Signing out ends this session for good — the next sign-in starts over, with
            Google or with your email and password. Access is limited to Cabinet Genies
            personnel; accounts are approved by an administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
