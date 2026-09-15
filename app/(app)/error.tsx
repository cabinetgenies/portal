"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authenticated area, so the sidebar stays usable when a
 * module fails to load.
 */
export default function PortalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Portal module error:", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-line bg-surface p-8">
      <div className="max-w-lg space-y-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          This module failed to load
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          The rest of the portal is still available from the navigation. Try again,
          and share the reference below if it keeps failing.
        </p>
        {error.digest ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-ink-muted">
            Reference: {error.digest}
          </p>
        ) : null}
        <Button onClick={() => retry()} variant="secondary">
          Try again
        </Button>
      </div>
    </div>
  );
}
