import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export function Brand({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link
      href="/home"
      className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
        CG
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "text-sm font-semibold tracking-tight",
            tone === "dark" ? "text-white" : "text-ink",
          )}
        >
          Cabinet Genies
        </span>
        <span
          className={cn(
            "text-[0.7rem] tracking-[0.18em] uppercase",
            tone === "dark" ? "text-white/45" : "text-ink-subtle",
          )}
        >
          Portal
        </span>
      </span>
    </Link>
  );
}
