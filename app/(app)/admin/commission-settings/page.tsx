import Link from "next/link";

import { CommissionSettingsForm } from "@/components/compensation/commission-settings-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon } from "@/components/icons";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import {
  getCommissionSettings,
  listCommissionSettingsHistory,
} from "@/lib/commission/event-queries";
import { todayIso } from "@/lib/compensation/queries";
import { formatDate, formatPercent } from "@/lib/utils/format";

export const metadata = {
  title: "Commission settings",
};

export default async function CommissionSettingsPage() {
  const session = await requireCapability("manage:compensation-config");

  if (!session.isAllowed) {
    return (
      <EmptyState
        icon={<CommissionsIcon className="h-5 w-5" />}
        title="Commission settings are managed by administrators"
        description="Your role can view commission configuration but not change it."
      />
    );
  }

  const [settings, history] = await Promise.all([
    getCommissionSettings(),
    listCommissionSettingsHistory(),
  ]);
  const today = todayIso();

  return (
    <div className="space-y-6">
      <Panel
        id="commission-rules"
        title="Commission rule inputs"
        description="Deposit payout percentage, the draw rate reduction and whether the draw system is enabled. These values apply to calculations from their effective date onward; every commission event snapshots the values it used, so existing events never change."
      >
        <CommissionSettingsForm
          settings={
            settings
              ? {
                  depositPayoutPercent: settings.depositPayoutPercent,
                  drawRateReduction: settings.drawRateReduction,
                  drawEnabled: settings.drawEnabled,
                  burdenPercent: settings.burdenPercent,
                  warrantyContingencyPercent: settings.warrantyContingencyPercent,
                  notes: settings.notes,
                }
              : null
          }
          defaultEffectiveFrom={settings?.effectiveFrom ?? today}
        />
      </Panel>

      <Panel
        id="commission-settings-history"
        title="Settings history"
        description="Effective-dated rule inputs, newest first. Saving a date that already exists replaces that row."
      >
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
            No settings rows yet.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-medium text-ink">
                  Effective {formatDate(row.effectiveFrom)}
                </span>
                <span className="text-ink-muted">
                  Deposit {formatPercent(row.depositPayoutPercent, 0)} · Draw reduction{" "}
                  {(row.drawRateReduction * 100).toFixed(2)} points · Draw system{" "}
                  {row.drawEnabled ? "enabled" : "disabled"} · Burden{" "}
                  {(row.burdenPercent * 100).toFixed(2)}% · Warranty{" "}
                  {(row.warrantyContingencyPercent * 100).toFixed(2)}%
                  {row.notes ? ` · ${row.notes}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="commission-plan-link"
        title="Tiers, versions and activation"
        description="GP thresholds, commission rates, effective dates and plan activation live on the plans themselves."
        actions={
          <Link
            href="/admin/compensation-plans"
            className={buttonClassName({ size: "sm", variant: "secondary" })}
          >
            Manage compensation plans
          </Link>
        }
      >
        <p className="text-sm leading-6 text-ink-muted">
          The seeded{" "}
          <span className="font-medium text-ink">
            Cabinet Genies Standard GP Commission
          </span>{" "}
          plan carries the production schedule: 30% at or above 50% GP, 20% from 45%, 10%
          from 35% and 0% below 35%. Change the tiers there — never in code — and add a new
          effective-dated version rather than editing one that has already been used.
        </p>
        <p className="text-xs leading-5 text-ink-subtle">
          Deposit payouts are currently{" "}
          {formatPercent(settings?.depositPayoutPercent ?? 0.5, 0)} of projected commission,
          effective {formatDate(settings?.effectiveFrom ?? null)}. Draw reduces the
          commission rate by{" "}
          {((settings?.drawRateReduction ?? 0.05) * 100).toFixed(2)} percentage points while
          an employee is enrolled.
        </p>
        <p className="text-xs leading-5 text-ink-subtle">
          Burden is currently{" "}
          {((settings?.burdenPercent ?? 0) * 100).toFixed(2)}% and warranty / service
          contingency {((settings?.warrantyContingencyPercent ?? 0) * 100).toFixed(2)}%. Both
          are applied to direct job cost — material, labor, subcontractor and other direct
          cost — and are added to total job cost before the commission tier is selected.
          Jobs already saved keep the rates they were stored with.
        </p>
      </Panel>
    </div>
  );
}
