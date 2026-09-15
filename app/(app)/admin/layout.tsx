import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { requireCapability } from "@/lib/auth/dal";
import { roleLabel } from "@/lib/permissions/roles";

/**
 * Administration is gated server-side. Hiding the sidebar link is presentation
 * only — a request to /admin from any other role is stopped here, and the pages
 * inside re-check through the data access layer.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireCapability("administer:portal");

  if (!session.isAllowed) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Administration is restricted"
        description={`Your portal role (${roleLabel(session.role)}) does not include user or configuration administration. Ask an administrator if you need access.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Portal administration"
        description="User access and portal configuration. Phase 1 establishes the foundations these screens grow into."
      />
      <AdminNav />
      {children}
    </div>
  );
}
