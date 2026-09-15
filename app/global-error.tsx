"use client";

import { Button } from "@/components/ui/button";

import "./globals.css";

/**
 * Last-resort boundary for failures in the root layout itself. It replaces the
 * document, so it must render its own html/body.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <div className="flex flex-1 items-center justify-center px-6 py-24">
          <div className="w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-8">
            <div className="space-y-2">
              <h1 className="text-lg font-semibold tracking-tight">
                The portal failed to start
              </h1>
              <p className="text-sm leading-6 text-ink-muted">
                Reload the page. If the problem continues, send the reference below
                to your administrator.
              </p>
            </div>
            {error.digest ? (
              <p className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-ink-muted">
                Reference: {error.digest}
              </p>
            ) : null}
            <Button onClick={() => retry()} className="w-full">
              Reload portal
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
