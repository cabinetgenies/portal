"use client";

import { useFormStatus } from "react-dom";

import { LogOutIcon, SpinnerIcon } from "@/components/icons";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils/cn";

export type SessionUser = {
  name: string;
  email: string | null;
  roleLabel: string;
  /** Business-role department, when the profile has one assigned. */
  departmentName?: string | null;
  initials: string;
};

function SignOutButton({ tone }: { tone: "dark" | "light" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60",
        tone === "dark"
          ? "text-white/60 hover:bg-white/5 hover:text-white focus-visible:outline-white/70"
          : "text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-accent",
      )}
    >
      {pending ? <SpinnerIcon className="h-4 w-4" /> : <LogOutIcon className="h-4 w-4" />}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/**
 * The signed-in user block at the foot of the sidebar and mobile drawer: who you
 * are, what role you hold, and the only way out of the session.
 */
export function UserPanel({
  user,
  tone = "dark",
}: {
  user: SessionUser;
  tone?: "dark" | "light";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        tone === "dark" ? "border-white/10 bg-white/[0.04]" : "border-line bg-surface",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          tone === "dark" ? "bg-white/10 text-white" : "bg-surface-muted text-ink",
        )}
      >
        {user.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            tone === "dark" ? "text-white" : "text-ink",
          )}
          title={user.name}
        >
          {user.name}
        </p>
        <p
          className={cn(
            "truncate text-xs",
            tone === "dark" ? "text-white/50" : "text-ink-subtle",
          )}
          title={[user.roleLabel, user.departmentName, user.email]
            .filter(Boolean)
            .join(" · ")}
        >
          {user.departmentName ? `${user.roleLabel} · ${user.departmentName}` : user.roleLabel}
        </p>
      </div>
      <form action={signOutAction}>
        <SignOutButton tone={tone} />
      </form>
    </div>
  );
}
