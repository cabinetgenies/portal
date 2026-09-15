import { roundMoney, toNumber } from "@/lib/commission/financials";
import { isSupabaseConfigured } from "@/lib/env";
import type { SessionContext } from "@/lib/auth/dal";
import { listVisibleProjects } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AuditEventRow,
  CommissionEventRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Widget data.
 *
 * Two rules shape this module:
 *
 *   1. No fake operational data. A widget either renders figures that came out of
 *      the database, or it says plainly that it has no data source yet. Nothing
 *      here is simulated, estimated or illustrative.
 *   2. A widget can never take the dashboard down. Every read is wrapped, and a
 *      failure becomes an honest "unavailable" state for that one card.
 *
 * Widgets reuse the existing domain reads rather than re-deriving anything: the
 * commission figures are the amounts already stored on each commission event, and
 * the project list is the `jobs` table under its existing RLS. No commission math
 * is reimplemented here.
 */

export type WidgetData =
  | {
      status: "ready";
      kind: "projects";
      items: { id: string; name: string; statusLabel: string; href: string }[];
      total: number;
    }
  | { status: "ready"; kind: "amount"; amount: number; count: number; note: string }
  | { status: "ready"; kind: "attention"; items: { label: string; hint: string }[] }
  | { status: "ready"; kind: "metrics"; metrics: { label: string; value: string; hint: string }[] }
  | {
      status: "ready";
      kind: "activity";
      items: { id: string; label: string; detail: string; actor: string; when: string }[];
    }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string };

const NOT_BUILT: Record<string, string> = {
  my_requests:
    "The requests module is not built yet, so there is nothing to list. Commission approvals are handled inside Commissions today.",
  training_due:
    "No training content exists yet. Knowledge has the metadata foundation for it; nothing has been migrated from Notion.",
  inventory_alerts:
    "Inventory is a registered module only at this stage — items, stock levels and receiving are not built, so there is nothing to alert on.",
  leadership_attention:
    "No leadership attention source is connected yet. This card will fill in once projects, requests and inventory record real data.",
  projects_at_risk:
    "Project risk needs schedule and margin signals that Buildertrend owns today. Nothing is estimated on its behalf.",
  department_health:
    "Department health will read from real workload and delivery data once those modules record it.",
};

export async function loadWidgetData(
  widgetKeys: readonly string[],
  context: { session: SessionContext; profile: ProfileRow | null },
): Promise<Record<string, WidgetData>> {
  const unique = Array.from(new Set(widgetKeys));

  const entries = await Promise.all(
    unique.map(async (key) => [key, await loadOne(key, context)] as const),
  );

  return Object.fromEntries(entries);
}

async function loadOne(
  widgetKey: string,
  context: { session: SessionContext; profile: ProfileRow | null },
): Promise<WidgetData> {
  const notBuilt = NOT_BUILT[widgetKey];
  if (notBuilt) {
    return { status: "unavailable", reason: notBuilt };
  }

  try {
    switch (widgetKey) {
      case "my_projects":
        return await loadProjects(widgetKey, context);
      case "projected_commission":
        return await loadCommissionAmount(context.session.userId, "calculated", {
          emptyReason: "No commission is projected on your jobs yet.",
          note: "Projected on open commission events",
        });
      case "pending_commission":
        return await loadCommissionAmount(context.session.userId, "pending_approval", {
          emptyReason: "Nothing of yours is waiting for approval.",
          note: "Awaiting approval",
        });
      case "ready_to_pay":
        return await loadCommissionAmount(context.session.userId, "approved", {
          emptyReason: "Nothing of yours is approved and unpaid.",
          note: "Approved, not yet paid",
        });
      case "my_approvals":
        return await loadApprovalQueue();
      case "commission_summary":
        return await loadCommissionSummary();
      case "company_activity":
        return await loadCompanyActivity();
      default:
        return {
          status: "unavailable",
          reason: "This widget has no data source yet.",
        };
    }
  } catch (error) {
    console.error(`Widget "${widgetKey}" could not load its data:`, error);
    return {
      status: "unavailable",
      reason: "This widget could not load its data just now.",
    };
  }
}

/**
 * Tolerant select.
 *
 * Row Level Security returns zero rows rather than an error, which is the normal
 * case for a role that is not allowed to read a table. Only a real failure is
 * logged, and it is left to the caller to decide what to show.
 */
async function safeSelect<T>(
  context: string,
  run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ rows: T[]; failed: boolean }> {
  const result = await run();

  if (result.error) {
    console.error(`Could not load ${context}:`, result.error.message);
    return { rows: [], failed: true };
  }

  return { rows: (result.data ?? []) as T[], failed: false };
}

async function loadProjects(
  _widgetKey: string,
  { session, profile }: { session: SessionContext; profile: ProfileRow | null },
): Promise<WidgetData> {
  const canViewAllJobs = session.capabilities.includes("view:jobs-all");
  const { items, failed } = await listVisibleProjects({
    profileId: profile?.id ?? null,
    canViewAllJobs,
    limit: 5,
  });

  if (failed) {
    return { status: "unavailable", reason: "Projects could not be loaded just now." };
  }

  if (items.length === 0) {
    return {
      status: "empty",
      reason: canViewAllJobs
        ? "No project records exist yet."
        : "No project records are assigned to you yet.",
    };
  }

  return {
    status: "ready",
    kind: "projects",
    total: items.length,
    items: items.map((project) => ({
      id: project.id,
      name: project.name,
      statusLabel: project.statusLabel,
      href: project.href,
    })),
  };
}

async function loadCommissionAmount(
  profileId: string,
  status: string,
  { emptyReason, note }: { emptyReason: string; note: string },
): Promise<WidgetData> {
  if (!isSupabaseConfigured) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const supabase = await createSupabaseServerClient();
  const { rows, failed } = await safeSelect<Pick<CommissionEventRow, "net_payable">>(
    "your commission events",
    () => supabase.from("commission_events").select("net_payable").eq("profile_id", profileId).eq("status", status),
  );

  if (failed) {
    return { status: "unavailable", reason: "Commission figures could not be loaded just now." };
  }

  if (rows.length === 0) {
    return { status: "empty", reason: emptyReason };
  }

  // The stored amounts, summed. Nothing is recalculated here.
  const amount = roundMoney(rows.reduce((total, row) => total + toNumber(row.net_payable), 0));

  return { status: "ready", kind: "amount", amount, count: rows.length, note };
}

async function loadApprovalQueue(): Promise<WidgetData> {
  if (!isSupabaseConfigured) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const supabase = await createSupabaseServerClient();
  const { rows, failed } = await safeSelect<
    Pick<CommissionEventRow, "id" | "job_id" | "net_payable" | "event_type">
  >("commission approvals", () =>
    supabase
      .from("commission_events")
      .select("id, job_id, net_payable, event_type")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true })
      .limit(6),
  );

  if (failed) {
    return { status: "unavailable", reason: "The approval queue could not be loaded just now." };
  }

  if (rows.length === 0) {
    return { status: "empty", reason: "Nothing is waiting on your approval." };
  }

  const jobNames = await jobNamesById(rows.map((row) => row.job_id));

  return {
    status: "ready",
    kind: "attention",
    items: rows.map((row) => ({
      label: jobNames.get(row.job_id) ?? "Commission event",
      hint: `${row.event_type.replaceAll("_", " ")} · ${formatAmount(row.net_payable)}`,
    })),
  };
}

async function loadCommissionSummary(): Promise<WidgetData> {
  if (!isSupabaseConfigured) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const supabase = await createSupabaseServerClient();
  const { rows, failed } = await safeSelect<Pick<CommissionEventRow, "status" | "net_payable">>(
    "the commission summary",
    () => supabase.from("commission_events").select("status, net_payable"),
  );

  if (failed) {
    return { status: "unavailable", reason: "The commission summary could not be loaded just now." };
  }

  if (rows.length === 0) {
    return { status: "empty", reason: "No commission events have been recorded yet." };
  }

  const sumWhere = (predicate: (status: string) => boolean) =>
    roundMoney(
      rows
        .filter((row) => predicate(row.status))
        .reduce((total, row) => total + toNumber(row.net_payable), 0),
    );

  const pending = rows.filter((row) => row.status === "pending_approval").length;
  const readyToPay = rows.filter((row) => row.status === "approved").length;
  const paid = rows.filter((row) => row.status === "paid").length;

  return {
    status: "ready",
    kind: "metrics",
    metrics: [
      {
        label: "Awaiting approval",
        value: `${pending}`,
        hint: formatAmount(sumWhere((status) => status === "pending_approval")),
      },
      {
        label: "Approved, unpaid",
        value: `${readyToPay}`,
        hint: formatAmount(sumWhere((status) => status === "approved")),
      },
      {
        label: "Paid events",
        value: `${paid}`,
        hint: formatAmount(sumWhere((status) => status === "paid")),
      },
    ],
  };
}

async function loadCompanyActivity(): Promise<WidgetData> {
  if (!isSupabaseConfigured) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const supabase = await createSupabaseServerClient();
  const { rows, failed } = await safeSelect<AuditEventRow>("company activity", () =>
    supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(6),
  );

  if (failed) {
    return { status: "unavailable", reason: "Activity could not be loaded just now." };
  }

  if (rows.length === 0) {
    return { status: "empty", reason: "No audited changes have been recorded yet." };
  }

  return {
    status: "ready",
    kind: "activity",
    items: rows.map((row) => ({
      id: row.id,
      label: `${row.entity_type.replaceAll("_", " ")} · ${row.action.replaceAll("_", " ")}`,
      detail: "",
      actor: row.changed_by ? "Portal user" : "Supabase Auth",
      when: formatDateTime(row.created_at),
    })),
  };
}

async function jobNamesById(jobIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = Array.from(new Set(jobIds));

  if (ids.length === 0 || !isSupabaseConfigured) return names;

  const supabase = await createSupabaseServerClient();
  const { rows } = await safeSelect<Pick<JobRow, "id" | "job_name">>(
    "job names for the approval queue",
    () => supabase.from("jobs").select("id, job_name").in("id", ids),
  );

  for (const row of rows) {
    names.set(row.id, row.job_name);
  }

  return names;
}

function formatAmount(value: unknown) {
  const amount = roundMoney(toNumber(value));

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
