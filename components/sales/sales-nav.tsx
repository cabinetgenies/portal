import { ModuleTabs } from "@/components/ui/module-tabs";
import { SALES_ROUTES } from "@/lib/routes";

const TABS = [
  { label: "Overview", href: SALES_ROUTES.overview },
  { label: "Commissions", href: SALES_ROUTES.commissions },
];

/**
 * The Sales module's own tab bar. Compact and secondary: the page itself carries the
 * heading, and the commission sub-app carries its own, so the two never compete.
 */
export function SalesNav() {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-[0.18em] text-ink-subtle uppercase">
        Sales
      </p>
      <ModuleTabs label="Sales sections" tabs={TABS} />
    </div>
  );
}
