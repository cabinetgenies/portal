"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Application-level error boundary. Next.js 16 hands error boundaries a `retry`
 * function, which re-renders the failed segment.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Portal error boundary:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-8">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Something went wrong
          </h1>
          <p className="text-sm leading-6 text-ink-muted">
            The portal could not finish loading this view. Try again — if it keeps
            happening, send the reference below to your administrator.
          </p>
        </div>
        {error.digest ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-ink-muted">
            Reference: {error.digest}
          </p>
        ) : null}
        <Button onClick={() => retry()} className="w-full">
          Try again
        </Button>
      </div>
    </div>
  );
}
