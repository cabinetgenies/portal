import Link from "next/link";

import { AssistantIcon } from "@/components/icons";
import { cn } from "@/lib/utils/cn";

/**
 * The single "Ask Cabinet Genies" entry point, rendered in both the desktop
 * sidebar and the mobile drawer. Every AI request goes through the one
 * orchestrator behind this link.
 */
export function AssistantLaunchLink({ variant = "sidebar" }: { variant?: "sidebar" | "drawer" }) {
  return (
    <Link
      href="/assistant"
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        variant === "sidebar"
          ? "border border-white/10 bg-white/[0.04] text-white hover:bg-white/10 focus-visible:outline-white/70"
          : "border border-line bg-surface-muted text-ink hover:bg-surface focus-visible:outline-accent",
      )}
    >
      <AssistantIcon className="h-[1.1rem] w-[1.1rem] text-accent" />
      Ask Cabinet Genies
    </Link>
  );
}

