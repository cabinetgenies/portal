import { WidgetContent } from "@/components/dashboard/widget-content";
import type { WidgetData } from "@/lib/experience/dashboard-data";
import type { ResolvedWidget } from "@/lib/experience/types";
import { cn } from "@/lib/utils/cn";

const SPAN_CLASSES: Record<number, string> = {
  1: "",
  2: "xl:col-span-2",
  3: "xl:col-span-3",
};

/**
 * One dashboard widget.
 *
 * The width comes from the role's widget configuration (`span`), and the content
 * from the widget's data loader. The card knows nothing about which role it is
 * rendering for — that is the whole point of the widget registry.
 */
export function DashboardWidgetCard({
  widget,
  data,
}: {
  widget: ResolvedWidget;
  data: WidgetData;
}) {
  return (
    <section
      aria-labelledby={`widget-${widget.key}`}
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-line bg-surface p-5",
        SPAN_CLASSES[widget.span] ?? "",
      )}
    >
      <div className="space-y-1">
        <h2 id={`widget-${widget.key}`} className="text-sm font-semibold tracking-tight text-ink">
          {widget.name}
        </h2>
        <p className="text-xs leading-5 text-ink-muted">{widget.description}</p>
      </div>
      <WidgetContent data={data} />
    </section>
  );
}
