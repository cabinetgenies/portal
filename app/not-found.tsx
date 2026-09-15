import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { buttonClassName } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-xs font-medium tracking-[0.18em] text-ink-subtle uppercase">
          404
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          That page is not part of the portal
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          The page you requested does not exist, or the module has not been built yet.
        </p>
        <Link href="/home" className={buttonClassName({ className: "w-full" })}>
          Back to dashboard
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
