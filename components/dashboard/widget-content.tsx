import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ClockIcon, InfoIcon, ProjectsIcon } from "@/components/icons";
import type { WidgetData } from "@/lib/experience/dashboard-data";
import { formatMoney } from "@/lib/utils/format";

/**
 * Renders whatever a widget actually has.
 *
 * The three terminal states are deliberately distinguishable in the UI:
 *
 *   ready        real data from the database
 *   empty        the data source exists and has nothing in it
 *   unavailable  no data source is connected yet, with the reason said out loud
 *
 * This is what keeps the dashboard honest. A widget with no live source shows an
 * explanation, never a placeholder number that looks like business data.
 */
export function WidgetContent({ data }: { data: WidgetData }) {
  if (data.status === "unavailable" || data.status === "empty") {
    return (
      <EmptyState
        className="border-0 bg-transparent px-0 py-8"
        icon={<InfoIcon className="h-5 w-5" />}
        title={data.status === "empty" ? "Nothing to show yet" : "No data source yet"}
        description={data.reason}
      />
    );
  }

  switch (data.kind) {
    case "projects":
      return (
        <ul className="divide-y divide-line text-sm">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
              <Link
                href={item.href}
                className="truncate font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {item.name}
              </Link>
              <span className="shrink-0 text-xs text-ink-subtle">{item.statusLabel}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 pt-3 text-xs text-ink-subtle">
            <ProjectsIcon className="h-3.5 w-3.5" />
            Showing {data.items.length} of {data.total} most recent.
          </li>
        </ul>
      );

    case "amount":
      return (
        <div className="space-y-1">
          <p className="text-3xl leading-none font-semibold tracking-tight text-ink">
            {formatMoney(data.amount)}
          </p>
          <p className="text-xs text-ink-subtle">
            {data.count} commission event{data.count === 1 ? "" : "s"} · {data.note}
          </p>
        </div>
      );

    case "attention":
      return (
        <ul className="divide-y divide-line text-sm">
          {data.items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-start justify-between gap-4 py-2.5">
              <span className="min-w-0 truncate font-medium text-ink">{item.label}</span>
              <span className="shrink-0 text-xs text-ink-subtle">{item.hint}</span>
            </li>
          ))}
        </ul>
      );

    case "metrics":
      return (
        <dl className="space-y-2.5 text-sm">
          {data.metrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-muted">{metric.label}</dt>
              <dd className="text-right">
                <span className="font-semibold text-ink">{metric.value}</span>
                <span className="block text-xs text-ink-subtle">{metric.hint}</span>
              </dd>
            </div>
          ))}
        </dl>
      );

    case "activity":
      return (
        <ul className="divide-y divide-line text-sm">
          {data.items.map((item) => (
            <li key={item.id} className="space-y-0.5 py-2.5">
              <p className="font-medium text-ink">{item.label}</p>
              <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                <ClockIcon className="h-3.5 w-3.5" />
                {item.actor} · {item.when}
              </p>
            </li>
          ))}
        </ul>
      );
  }
}
