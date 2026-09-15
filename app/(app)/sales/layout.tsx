import type { ReactNode } from "react";

import { SalesNav } from "@/components/sales/sales-nav";

/**
 * The Sales module shell. It deliberately renders only the compact module tab bar:
 * each page owns its heading, and the commission sub-app below adds its own, so the
 * hierarchy reads as Sales → Commissions without two competing page headers.
 */
export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <SalesNav />
      {children}
    </div>
  );
}
