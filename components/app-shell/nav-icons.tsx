import type { ComponentType } from "react";

import {
  ActivityIcon,
  AdminIcon,
  CommissionsIcon,
  DashboardIcon,
  InventoryIcon,
  KnowledgeIcon,
  OperationsIcon,
  ProductionIcon,
  ProjectsIcon,
  ReportsIcon,
  SalesIcon,
  UsersIcon,
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
  people: UsersIcon,
  requests: ActivityIcon,
  company: ProjectsIcon,
  inventory: InventoryIcon,
  operations: OperationsIcon,
  knowledge: KnowledgeIcon,
};
