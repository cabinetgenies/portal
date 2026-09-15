import type { ComponentType } from "react";

import {
  AdminIcon,
  CommissionsIcon,
  DashboardIcon,
  ProductionIcon,
  ProjectsIcon,
  ReportsIcon,
  SalesIcon,
  type IconProps,
} from "@/components/icons";
import type { NavIconKey } from "@/lib/permissions/navigation";

export const NAV_ICONS: Record<NavIconKey, ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  sales: SalesIcon,
  projects: ProjectsIcon,
  production: ProductionIcon,
  commissions: CommissionsIcon,
  reports: ReportsIcon,
  admin: AdminIcon,
};
