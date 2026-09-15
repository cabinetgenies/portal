import { AlertIcon } from "@/components/icons";

/**
 * Shown when the deployment is missing its Supabase environment variables. It is
 * deliberately explicit about the fix instead of failing with a runtime error.
 */
export function ConfigurationNotice({
  title = "Supabase is not configured",
  description = "This deployment is missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local (see .env.example) or to the Vercel project environment variables, then restart.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-xl border border-line bg-surface p-5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
        <AlertIcon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
      </div>
    </div>
  );
}
