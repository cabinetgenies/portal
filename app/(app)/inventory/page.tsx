import { EmptyState } from "@/components/empty-state/empty-state";
import { InventoryIcon } from "@/components/icons";
import { ContextualHelp } from "@/components/knowledge/contextual-help";
import { PageHeader } from "@/components/page-header/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { contextualKnowledge } from "@/lib/knowledge/queries";

export const metadata = {
  title: "Inventory",
};

const PLANNED_CAPABILITIES: readonly [string, string][] = [
  ["Items", "What the company stocks, with units and suppliers."],
  ["Receiving", "A delivery arriving, in whole or in part."],
  ["Allocations", "Stock committed to a project."],
  ["Adjustments", "A correction with a reason and an author."],
  ["Cycle counts", "A scheduled count and the variance it found."],
  ["Low stock", "What has fallen below its reorder point."],
];

/**
 * Inventory — a registered module with a clean shell.
 *
 * This phase registers the module, gives it a route and says what it will hold. It
 * does not build items, receiving, allocations, adjustments or cycle counts, and it
 * does not show invented stock levels: an empty shelf is better than a fake one.
 */
export default async function InventoryPage() {
  await requireSession();

  const help = await contextualKnowledge({ contextKey: "inventory-receiving" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Inventory"
        description="Items, receiving, allocations, adjustments and stock levels. The module is registered and routed; the inventory system itself is not built yet."
      />

      <EmptyState
        icon={<InventoryIcon className="h-5 w-5" />}
        title="No inventory data exists yet"
        description="There is no stock table behind this screen, so there is nothing to show and nothing is simulated. When receiving is built it will land here, with real movements and a reason on every adjustment."
      />

      <Panel
        id="inventory-planned"
        title="What this module will hold"
        description="Named now so the boundary is explicit rather than implied by an empty screen."
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLANNED_CAPABILITIES.map(([title, description]) => (
            <li
              key={title}
              className="space-y-1 rounded-lg border border-line bg-surface-muted p-4"
            >
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-sm leading-6 text-ink-muted">{description}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <ContextualHelp items={help} contextKey="inventory-receiving" />
    </div>
  );
}
