"use client";

import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Overview", href: "/performance" },
  { label: "Scorecards", href: "/performance/scorecards" },
  { label: "Priorities", href: "/performance/priorities" },
  { label: "Meetings", href: "/performance/meetings" },
  { label: "Issues & Actions", href: "/performance/issues" },
  { label: "Reviews", href: "/performance/reviews" },
];

export function PerformanceNav() {
  return <ModuleTabs label="Performance & Leadership" tabs={TABS} />;
}

