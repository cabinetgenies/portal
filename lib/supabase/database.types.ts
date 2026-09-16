/**
 * Hand-maintained database types.
 *
 * Keep in sync with `supabase/migrations`. Once the Supabase CLI is linked to
 * the project these can be regenerated with:
 *
 *   npx supabase gen types typescript --project-id <project-id> --schema public > lib/supabase/database.types.ts
 *
 * Naming note: the shared compensation structures are deliberately not named
 * after sales designer commission. A compensation plan has a participant kind,
 * so the same tables carry future sales manager bonus plans without rewriting
 * designer history. See docs/compensation-architecture.md.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Roles defined by `profiles_role_check` in the initial migration. */
export const PROFILE_ROLES = [
  "employee",
  "supervisor",
  "accounting",
  "admin",
  "ceo",
] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  role: ProfileRole;
  /** Legacy free-text department. Superseded by `department_id`; kept in step by
   *  the `profiles_sync_department_name` trigger whenever a department is assigned. */
  department: string | null;
  /** Primary department assignment (registry). Experience, not authorization. */
  department_id: string | null;
  /** Primary business role assignment. Decides the role experience only. */
  business_role_id: string | null;
  manager_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  role?: ProfileRole;
  department?: string | null;
  department_id?: string | null;
  business_role_id?: string | null;
  manager_id?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<ProfileInsert>;

/** Who a compensation plan compensates. `sales_manager` is reserved. */
export type ParticipantKind = "sales_designer" | "sales_manager";

export type CompensationPlanRow = {
  id: string;
  name: string;
  description: string | null;
  participant_kind: string;
  plan_type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompensationPlanInsert = {
  id?: string;
  name: string;
  description?: string | null;
  participant_kind?: string;
  plan_type?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CompensationPlanUpdate = Partial<CompensationPlanInsert>;

export type CompensationPlanVersionRow = {
  id: string;
  compensation_plan_id: string;
  version_name: string;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CompensationPlanVersionInsert = {
  id?: string;
  compensation_plan_id: string;
  version_name: string;
  effective_from: string;
  effective_to?: string | null;
  active?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CompensationPlanVersionUpdate = Partial<CompensationPlanVersionInsert>;

export type CompensationPlanTierRow = {
  id: string;
  compensation_plan_version_id: string;
  sort_order: number;
  lower_gp_percent: number | null;
  lower_threshold_type: string;
  upper_gp_percent: number | null;
  upper_threshold_type: string;
  rate: number;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type CompensationPlanTierInsert = {
  id?: string;
  compensation_plan_version_id: string;
  sort_order?: number;
  lower_gp_percent?: number | null;
  lower_threshold_type?: string;
  upper_gp_percent?: number | null;
  upper_threshold_type?: string;
  rate: number;
  label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CompensationPlanTierUpdate = Partial<CompensationPlanTierInsert>;

export type EmployeeCompensationSettingsRow = {
  id: string;
  profile_id: string;
  compensation_eligible: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeCompensationSettingsInsert = {
  id?: string;
  profile_id: string;
  compensation_eligible?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeCompensationSettingsUpdate =
  Partial<EmployeeCompensationSettingsInsert>;

export type EmployeeCompensationAssignmentRow = {
  id: string;
  profile_id: string;
  compensation_plan_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeCompensationAssignmentInsert = {
  id?: string;
  profile_id: string;
  compensation_plan_id: string;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeCompensationAssignmentUpdate =
  Partial<EmployeeCompensationAssignmentInsert>;

export type EmployeeReportingPeriodRow = {
  id: string;
  profile_id: string;
  manager_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeReportingPeriodInsert = {
  id?: string;
  profile_id: string;
  manager_id: string;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeReportingPeriodUpdate = Partial<EmployeeReportingPeriodInsert>;

export type JobRow = {
  id: string;
  job_number: string | null;
  job_name: string;
  customer_name: string | null;
  /** DORMANT since Phase 4.1: project categories are no longer part of commissions. */
  project_category_id: string | null;
  status: string;
  sales_designer_id: string | null;
  sold_date: string | null;
  deposit_received_date: string | null;
  completion_date: string | null;
  gp_audit_completed_date: string | null;
  contract_revenue: number;
  change_order_revenue: number;
  credit_amount: number;
  other_revenue: number;
  material_cost: number;
  labor_cost: number;
  subcontractor_cost: number;
  other_direct_cost: number;
  /** Original Costs — the single original cost input (Phase 3.8). */
  original_cost: number;
  /** Derived roll-up of the active change orders' cost. */
  change_order_cost: number;
  burden_cost: number;
  warranty_service_contingency: number;
  actual_total_revenue: number;
  actual_total_cost: number;
  job_gross_profit: number;
  job_gp_percent: number;
  commissionable_revenue: number;
  commissionable_cost: number;
  commissionable_gross_profit: number;
  commissionable_gp_percent: number;
  burden_percent: number | null;
  warranty_contingency_percent: number | null;
  compensation_plan_id: string | null;
  compensation_plan_version_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JobInsert = {
  id?: string;
  job_number?: string | null;
  job_name: string;
  customer_name?: string | null;
  project_category_id?: string | null;
  status?: string;
  sales_designer_id?: string | null;
  sold_date?: string | null;
  deposit_received_date?: string | null;
  completion_date?: string | null;
  gp_audit_completed_date?: string | null;
  contract_revenue?: number;
  change_order_revenue?: number;
  credit_amount?: number;
  other_revenue?: number;
  material_cost?: number;
  labor_cost?: number;
  subcontractor_cost?: number;
  other_direct_cost?: number;
  original_cost?: number;
  change_order_cost?: number;
  burden_cost?: number;
  warranty_service_contingency?: number;
  actual_total_revenue?: number;
  actual_total_cost?: number;
  job_gross_profit?: number;
  job_gp_percent?: number;
  commissionable_revenue?: number;
  commissionable_cost?: number;
  commissionable_gross_profit?: number;
  commissionable_gp_percent?: number;
  burden_percent?: number | null;
  warranty_contingency_percent?: number | null;
  compensation_plan_id?: string | null;
  compensation_plan_version_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type JobUpdate = Partial<JobInsert>;

export type JobFinancialAdjustmentRow = {
  id: string;
  job_id: string;
  adjustment_type: string;
  amount: number;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type JobFinancialAdjustmentInsert = {
  id?: string;
  job_id: string;
  adjustment_type: string;
  amount: number;
  reason: string;
  created_by?: string | null;
  created_at?: string;
};

export type JobFinancialAdjustmentUpdate = Partial<JobFinancialAdjustmentInsert>;

/** A change order: a real child record, not an aggregate on the job. */
export type JobChangeOrderRow = {
  id: string;
  job_id: string;
  change_order_number: string | null;
  name: string;
  revenue: number;
  cost: number;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JobChangeOrderInsert = {
  id?: string;
  job_id: string;
  change_order_number?: string | null;
  name: string;
  revenue?: number;
  cost?: number;
  active?: boolean;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type JobChangeOrderUpdate = Partial<JobChangeOrderInsert>;

/** A finalized (or in-review) final commission audit snapshot. */
export type CommissionAuditRow = {
  id: string;
  job_id: string;
  revision: number;
  status: string;
  original_contract_price: number;
  change_order_revenue: number;
  other_revenue: number;
  credit_amount: number;
  original_cost: number;
  change_order_cost: number;
  direct_job_cost: number;
  burden_percent: number;
  burden_cost: number;
  warranty_contingency_percent: number;
  warranty_service_contingency: number;
  final_total_revenue: number;
  final_total_cost: number;
  final_gross_profit: number;
  final_gp_percent: number;
  commissionable_revenue: number;
  commissionable_cost: number;
  commissionable_gross_profit: number;
  commissionable_gp_percent: number;
  compensation_plan_id: string | null;
  compensation_plan_version_id: string | null;
  tier_label: string | null;
  standard_commission_rate: number;
  draw_rate_reduction: number;
  effective_commission_rate: number;
  final_gross_commission: number;
  previously_recognized: number;
  final_true_up: number;
  notes: string | null;
  started_by: string | null;
  started_at: string;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionAuditInsert = Partial<
  Omit<CommissionAuditRow, "job_id">
> & { job_id: string };

export type CommissionAuditUpdate = Partial<CommissionAuditInsert>;

export type AuditEventRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string | null;
  metadata: Json;
  created_at: string;
};

export type AuditEventInsert = {
  id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by?: string | null;
  metadata?: Json;
  created_at?: string;
};

export type AuditEventUpdate = Partial<AuditEventInsert>;

export type CommissionSettingsRow = {
  id: string;
  effective_from: string;
  deposit_payout_percent: number;
  draw_rate_reduction: number;
  draw_enabled: boolean;
  burden_percent: number;
  warranty_contingency_percent: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionSettingsInsert = {
  id?: string;
  effective_from: string;
  deposit_payout_percent?: number;
  draw_rate_reduction?: number;
  draw_enabled?: boolean;
  burden_percent?: number;
  warranty_contingency_percent?: number;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CommissionSettingsUpdate = Partial<CommissionSettingsInsert>;

export type EmployeeDrawPeriodRow = {
  id: string;
  profile_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeDrawPeriodInsert = {
  id?: string;
  profile_id: string;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeDrawPeriodUpdate = Partial<EmployeeDrawPeriodInsert>;

export type EmployeeDrawLedgerRow = {
  id: string;
  profile_id: string;
  transaction_type: string;
  amount: number;
  job_id: string | null;
  commission_event_id: string | null;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type EmployeeDrawLedgerInsert = {
  id?: string;
  profile_id: string;
  transaction_type: string;
  amount: number;
  job_id?: string | null;
  commission_event_id?: string | null;
  reason: string;
  created_by?: string | null;
  created_at?: string;
};

export type EmployeeDrawLedgerUpdate = Partial<EmployeeDrawLedgerInsert>;

export type CommissionRolloverLedgerRow = {
  id: string;
  profile_id: string;
  job_id: string | null;
  commission_event_id: string | null;
  transaction_type: string;
  amount: number;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type CommissionRolloverLedgerInsert = {
  id?: string;
  profile_id: string;
  job_id?: string | null;
  commission_event_id?: string | null;
  transaction_type: string;
  amount: number;
  reason: string;
  created_by?: string | null;
  created_at?: string;
};

export type CommissionRolloverLedgerUpdate = Partial<CommissionRolloverLedgerInsert>;

export type CommissionEventRow = {
  id: string;
  job_id: string;
  profile_id: string;
  event_type: string;
  calculation_stage: string;
  compensation_plan_id: string;
  compensation_plan_version_id: string;
  commissionable_gp: number;
  commissionable_gp_percent: number;
  tier_label: string | null;
  standard_commission_rate: number;
  draw_rate_reduction: number;
  effective_commission_rate: number;
  job_gross_commission: number;
  deposit_payout_percent: number;
  gross_commission: number;
  previously_recognized: number;
  rollover_offset: number;
  draw_offset: number;
  net_payable: number;
  status: string;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  calculation_metadata: Json;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionEventInsert = {
  id?: string;
  job_id: string;
  profile_id: string;
  event_type: string;
  calculation_stage: string;
  compensation_plan_id: string;
  compensation_plan_version_id: string;
  commissionable_gp?: number;
  commissionable_gp_percent?: number;
  tier_label?: string | null;
  standard_commission_rate?: number;
  draw_rate_reduction?: number;
  effective_commission_rate?: number;
  job_gross_commission?: number;
  deposit_payout_percent?: number;
  gross_commission?: number;
  previously_recognized?: number;
  rollover_offset?: number;
  draw_offset?: number;
  net_payable?: number;
  status?: string;
  void_reason?: string | null;
  voided_by?: string | null;
  voided_at?: string | null;
  calculation_metadata?: Json;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CommissionEventUpdate = Partial<CommissionEventInsert>;

// ---------------------------------------------------------------------------
// Phase 5 — business architecture
//
// Departments and business roles are separate concepts: a department is where
// somebody belongs, a business role is what their app experience looks like.
// Business roles never widen authorization — profiles.role (the security role)
// and Row Level Security stay authoritative.
// ---------------------------------------------------------------------------

export const KNOWLEDGE_ITEM_TYPES = [
  "training",
  "sop",
  "role_expectation",
  "playbook",
  "form_reference",
  "document",
  "policy",
  "decision_guide",
] as const;

export type KnowledgeItemType = (typeof KNOWLEDGE_ITEM_TYPES)[number];

export const KNOWLEDGE_ITEM_STATUSES = ["draft", "published", "archived"] as const;

export type KnowledgeItemStatus = (typeof KNOWLEDGE_ITEM_STATUSES)[number];

export const MODULE_NAV_SECTIONS = ["primary", "support", "admin"] as const;

export type ModuleNavSection = (typeof MODULE_NAV_SECTIONS)[number];

export type DepartmentRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_profile_id: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type DepartmentInsert = {
  id?: string;
  slug: string;
  name: string;
  description?: string | null;
  owner_profile_id?: string | null;
  active?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type DepartmentUpdate = Partial<DepartmentInsert>;

export type DepartmentLeaderRow = {
  id: string;
  department_id: string;
  profile_id: string;
  created_by: string | null;
  created_at: string;
};

export type DepartmentLeaderInsert = {
  id?: string;
  department_id: string;
  profile_id: string;
  created_by?: string | null;
  created_at?: string;
};

export type DepartmentLeaderUpdate = Partial<DepartmentLeaderInsert>;

export type BusinessRoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  department_id: string | null;
  is_system: boolean;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type BusinessRoleInsert = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  department_id?: string | null;
  is_system?: boolean;
  active?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type BusinessRoleUpdate = Partial<BusinessRoleInsert>;

export type AppModuleRow = {
  id: string;
  key: string;
  slug: string;
  name: string;
  description: string | null;
  href: string;
  icon_key: string;
  nav_section: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type AppModuleInsert = {
  id?: string;
  key: string;
  slug: string;
  name: string;
  description?: string | null;
  href: string;
  icon_key: string;
  nav_section?: string;
  is_active?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type AppModuleUpdate = Partial<AppModuleInsert>;

export type RoleModuleRow = {
  id: string;
  business_role_id: string;
  module_id: string;
  is_visible: boolean;
  is_emphasized: boolean;
  is_default_landing: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type RoleModuleInsert = {
  id?: string;
  business_role_id: string;
  module_id: string;
  is_visible?: boolean;
  is_emphasized?: boolean;
  is_default_landing?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type RoleModuleUpdate = Partial<RoleModuleInsert>;

export type DashboardWidgetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  component_key: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type DashboardWidgetInsert = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  component_key: string;
  is_active?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type DashboardWidgetUpdate = Partial<DashboardWidgetInsert>;

export type RoleDashboardWidgetRow = {
  id: string;
  business_role_id: string;
  widget_id: string;
  is_visible: boolean;
  span: number;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type RoleDashboardWidgetInsert = {
  id?: string;
  business_role_id: string;
  widget_id: string;
  is_visible?: boolean;
  span?: number;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type RoleDashboardWidgetUpdate = Partial<RoleDashboardWidgetInsert>;

export type QuickActionRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  href: string | null;
  action_key: string | null;
  icon_key: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type QuickActionInsert = {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  href?: string | null;
  action_key?: string | null;
  icon_key?: string | null;
  is_active?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type QuickActionUpdate = Partial<QuickActionInsert>;

export type RoleQuickActionRow = {
  id: string;
  business_role_id: string;
  quick_action_id: string;
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type RoleQuickActionInsert = {
  id?: string;
  business_role_id: string;
  quick_action_id: string;
  is_visible?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type RoleQuickActionUpdate = Partial<RoleQuickActionInsert>;

export type KnowledgeItemRow = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  department_id: string | null;
  business_role_id: string | null;
  description: string | null;
  body: string | null;
  reference_url: string | null;
  tags: string[];
  context_key: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeItemInsert = {
  id?: string;
  title: string;
  slug: string;
  type: string;
  status?: string;
  department_id?: string | null;
  business_role_id?: string | null;
  description?: string | null;
  body?: string | null;
  reference_url?: string | null;
  tags?: string[];
  context_key?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type KnowledgeItemUpdate = Partial<KnowledgeItemInsert>;

export type KnowledgeItemRoleRow = {
  id: string;
  knowledge_item_id: string;
  business_role_id: string;
  created_at: string;
};

export type KnowledgeItemRoleInsert = {
  id?: string;
  knowledge_item_id: string;
  business_role_id: string;
  created_at?: string;
};

export type KnowledgeItemRoleUpdate = Partial<KnowledgeItemRoleInsert>;

// ---------------------------------------------------------------------------
// Performance & Leadership domain types
// ---------------------------------------------------------------------------

export const MEASURABLE_SCOPES = ["company", "department", "employee"] as const;
export type MeasurableScope = (typeof MEASURABLE_SCOPES)[number];

export const MEASURABLE_FREQUENCIES = ["weekly", "monthly"] as const;
export type MeasurableFrequency = (typeof MEASURABLE_FREQUENCIES)[number];

export const MEASURABLE_STATUSES = ["on_track", "off_track", "no_data"] as const;
export type MeasurableStatus = (typeof MEASURABLE_STATUSES)[number];

export type PerformanceMeasurableRow = {
  id: string;
  name: string;
  scope: string;
  owner_profile_id: string | null;
  department_id: string | null;
  employee_id: string | null;
  target: number | null;
  unit: string | null;
  frequency: string;
  current_value: number | null;
  status: string;
  notes: string | null;
  knowledge_item_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PerformanceMeasurableInsert = {
  id?: string;
  name: string;
  scope: string;
  owner_profile_id?: string | null;
  department_id?: string | null;
  employee_id?: string | null;
  target?: number | null;
  unit?: string | null;
  frequency?: string;
  current_value?: number | null;
  status?: string;
  notes?: string | null;
  knowledge_item_id?: string | null;
  active?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PerformanceMeasurableUpdate = Partial<PerformanceMeasurableInsert>;

export type PerformanceScorecardEntryRow = {
  id: string;
  measurable_id: string;
  period_start: string;
  period_end: string;
  target_snapshot: number | null;
  actual_value: number | null;
  status: string;
  entered_by: string | null;
  entered_at: string;
  notes: string | null;
};

export type PerformanceScorecardEntryInsert = {
  id?: string;
  measurable_id: string;
  period_start: string;
  period_end: string;
  target_snapshot?: number | null;
  actual_value?: number | null;
  status?: string;
  entered_by?: string | null;
  entered_at?: string;
  notes?: string | null;
};

export type PerformanceScorecardEntryUpdate =
  Partial<PerformanceScorecardEntryInsert>;

export const PRIORITY_STATUSES = [
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "complete",
] as const;
export type PriorityStatus = (typeof PRIORITY_STATUSES)[number];

export type QuarterlyPriorityRow = {
  id: string;
  title: string;
  description: string | null;
  owner_profile_id: string | null;
  department_id: string | null;
  quarter: number;
  year: number;
  due_date: string | null;
  status: string;
  percent_complete: number;
  notes: string | null;
  knowledge_item_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type QuarterlyPriorityInsert = {
  id?: string;
  title: string;
  description?: string | null;
  owner_profile_id?: string | null;
  department_id?: string | null;
  quarter: number;
  year: number;
  due_date?: string | null;
  status?: string;
  percent_complete?: number;
  notes?: string | null;
  knowledge_item_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

export type QuarterlyPriorityUpdate = Partial<QuarterlyPriorityInsert>;

export type MeetingTemplateRow = {
  id: string;
  name: string;
  meeting_type: string;
  team_department_id: string | null;
  cadence: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MeetingTemplateInsert = {
  id?: string;
  name: string;
  meeting_type: string;
  team_department_id?: string | null;
  cadence?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MeetingTemplateUpdate = Partial<MeetingTemplateInsert>;

export type MeetingTemplateParticipantRow = {
  id: string;
  meeting_template_id: string;
  profile_id: string;
  created_at: string;
};

export type MeetingTemplateParticipantInsert = {
  id?: string;
  meeting_template_id: string;
  profile_id: string;
  created_at?: string;
};

export type MeetingTemplateParticipantUpdate =
  Partial<MeetingTemplateParticipantInsert>;

export type MeetingAgendaSectionRow = {
  id: string;
  meeting_template_id: string;
  section_key: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MeetingAgendaSectionInsert = {
  id?: string;
  meeting_template_id: string;
  section_key: string;
  title: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type MeetingAgendaSectionUpdate = Partial<MeetingAgendaSectionInsert>;

export type MeetingRow = {
  id: string;
  meeting_template_id: string | null;
  meeting_type: string;
  team_department_id: string | null;
  meeting_date: string;
  status: string;
  scorecard_review: string | null;
  priority_review: string | null;
  notes: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingInsert = {
  id?: string;
  meeting_template_id?: string | null;
  meeting_type: string;
  team_department_id?: string | null;
  meeting_date: string;
  status?: string;
  scorecard_review?: string | null;
  priority_review?: string | null;
  notes?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MeetingUpdate = Partial<MeetingInsert>;

export type MeetingParticipantRow = {
  id: string;
  meeting_id: string;
  profile_id: string;
  created_at: string;
};

export type MeetingParticipantInsert = {
  id?: string;
  meeting_id: string;
  profile_id: string;
  created_at?: string;
};

export type MeetingParticipantUpdate = Partial<MeetingParticipantInsert>;

export type MeetingHeadlineRow = {
  id: string;
  meeting_id: string | null;
  title: string;
  note: string | null;
  type: string | null;
  department_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type MeetingHeadlineInsert = {
  id?: string;
  meeting_id?: string | null;
  title: string;
  note?: string | null;
  type?: string | null;
  department_id?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export type MeetingHeadlineUpdate = Partial<MeetingHeadlineInsert>;

export const ISSUE_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_STATUSES = ["open", "discussing", "resolved", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SOURCES = [
  "manual",
  "meeting",
  "scorecard",
  "quarterly_priority",
  "review",
] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

export type IssueRow = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  owner_profile_id: string | null;
  priority: string;
  status: string;
  source: string;
  source_id: string | null;
  meeting_id: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueInsert = {
  id?: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  owner_profile_id?: string | null;
  priority?: string;
  status?: string;
  source?: string;
  source_id?: string | null;
  meeting_id?: string | null;
  resolved_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type IssueUpdate = Partial<IssueInsert>;

export type IssueNoteRow = {
  id: string;
  issue_id: string;
  author_profile_id: string | null;
  body: string;
  created_at: string;
};

export type IssueNoteInsert = {
  id?: string;
  issue_id: string;
  author_profile_id?: string | null;
  body: string;
  created_at?: string;
};

export type IssueNoteUpdate = Partial<IssueNoteInsert>;

export const ACTION_STATUSES = ["open", "complete", "cancelled"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_SOURCES = [
  "manual",
  "meeting",
  "issue",
  "review",
  "quarterly_priority",
] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

export type ActionItemRow = {
  id: string;
  title: string;
  description: string | null;
  owner_profile_id: string | null;
  department_id: string | null;
  source: string;
  source_id: string | null;
  meeting_id: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionItemInsert = {
  id?: string;
  title: string;
  description?: string | null;
  owner_profile_id?: string | null;
  department_id?: string | null;
  source?: string;
  source_id?: string | null;
  meeting_id?: string | null;
  due_date?: string | null;
  status?: string;
  completed_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ActionItemUpdate = Partial<ActionItemInsert>;

export type DecisionRow = {
  id: string;
  title: string;
  decision: string;
  issue_id: string | null;
  meeting_id: string | null;
  department_id: string | null;
  decided_by: string | null;
  decided_at: string;
  created_at: string;
};

export type DecisionInsert = {
  id?: string;
  title: string;
  decision: string;
  issue_id?: string | null;
  meeting_id?: string | null;
  department_id?: string | null;
  decided_by?: string | null;
  decided_at?: string;
  created_at?: string;
};

export type DecisionUpdate = Partial<DecisionInsert>;

export const REVIEW_STATUSES = [
  "not_started",
  "in_progress",
  "employee_input",
  "manager_review",
  "complete",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type PerformanceReviewRow = {
  id: string;
  employee_id: string;
  manager_id: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  scheduled_date: string | null;
  completed_date: string | null;
  employee_notes: string | null;
  overall_summary: string | null;
  development_actions: string | null;
  measurable_snapshot_ids: string[];
  priority_snapshot_ids: string[];
  knowledge_item_snapshot_ids: string[];
  snapshot_data: Json | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PerformanceReviewInsert = {
  id?: string;
  employee_id: string;
  manager_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status?: string;
  scheduled_date?: string | null;
  completed_date?: string | null;
  employee_notes?: string | null;
  overall_summary?: string | null;
  development_actions?: string | null;
  measurable_snapshot_ids?: string[];
  priority_snapshot_ids?: string[];
  knowledge_item_snapshot_ids?: string[];
  snapshot_data?: Json | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PerformanceReviewUpdate = Partial<PerformanceReviewInsert>;

export type PerformanceReviewManagerNoteRow = {
  id: string;
  review_id: string;
  body: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PerformanceReviewManagerNoteInsert = {
  id?: string;
  review_id: string;
  body: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PerformanceReviewManagerNoteUpdate =
  Partial<PerformanceReviewManagerNoteInsert>;

export type AiAgentConfigRow = {
  id: string;
  agent_id: string;
  enabled: boolean;
  model_alias: string;
  allowed_tools: string[];
  tool_limits: Json;
  kill_switch: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AiAgentConfigInsert = {
  id?: string;
  agent_id: string;
  enabled?: boolean;
  model_alias?: string;
  allowed_tools?: string[];
  tool_limits?: Json;
  kill_switch?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AiAgentConfigUpdate = Partial<AiAgentConfigInsert>;

export type AiRoleAgentRow = {
  id: string;
  business_role_id: string;
  agent_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiRoleAgentInsert = {
  id?: string;
  business_role_id: string;
  agent_id: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AiRoleAgentUpdate = Partial<AiRoleAgentInsert>;

export type AiConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type AiConversationInsert = {
  id?: string;
  user_id: string;
  title?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AiConversationUpdate = Partial<AiConversationInsert>;

export type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  payload: Json;
  created_at: string;
};

export type AiMessageInsert = {
  id?: string;
  conversation_id: string;
  role: string;
  content: string;
  payload?: Json;
  created_at?: string;
};

export type AiMessageUpdate = Partial<AiMessageInsert>;

export type AiRunRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  agent_id: string;
  status: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model_calls: number;
  tool_calls: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type AiRunInsert = {
  id?: string;
  conversation_id: string;
  user_id: string;
  agent_id: string;
  status?: string;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  model_calls?: number;
  tool_calls?: number;
  error_message?: string | null;
  started_at?: string;
  completed_at?: string | null;
  created_at?: string;
};

export type AiRunUpdate = Partial<AiRunInsert>;

export type AiRunStepRow = {
  id: string;
  run_id: string;
  user_id: string;
  sequence: number;
  agent_id: string | null;
  kind: string;
  input: Json | null;
  output: Json | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type AiRunStepInsert = {
  id?: string;
  run_id: string;
  user_id: string;
  sequence: number;
  agent_id?: string | null;
  kind: string;
  input?: Json | null;
  output?: Json | null;
  status?: string;
  error_message?: string | null;
  started_at?: string;
  completed_at?: string | null;
  created_at?: string;
};

export type AiRunStepUpdate = Partial<AiRunStepInsert>;

export type AiArtifactRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  run_id: string | null;
  kind: string;
  title: string;
  content: Json;
  status: string;
  version: number;
  payload_hash: string;
  unique_execution_key: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiArtifactInsert = {
  id?: string;
  user_id: string;
  conversation_id?: string | null;
  run_id?: string | null;
  kind: string;
  title: string;
  content: Json;
  status?: string;
  version?: number;
  payload_hash: string;
  unique_execution_key?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AiArtifactUpdate = Partial<AiArtifactInsert>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      compensation_plans: {
        Row: CompensationPlanRow;
        Insert: CompensationPlanInsert;
        Update: CompensationPlanUpdate;
        Relationships: [];
      };
      compensation_plan_versions: {
        Row: CompensationPlanVersionRow;
        Insert: CompensationPlanVersionInsert;
        Update: CompensationPlanVersionUpdate;
        Relationships: [
          {
            foreignKeyName: "compensation_plan_versions_compensation_plan_id_fkey";
            columns: ["compensation_plan_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      compensation_plan_tiers: {
        Row: CompensationPlanTierRow;
        Insert: CompensationPlanTierInsert;
        Update: CompensationPlanTierUpdate;
        Relationships: [
          {
            foreignKeyName: "compensation_plan_tiers_compensation_plan_version_id_fkey";
            columns: ["compensation_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_compensation_settings: {
        Row: EmployeeCompensationSettingsRow;
        Insert: EmployeeCompensationSettingsInsert;
        Update: EmployeeCompensationSettingsUpdate;
        Relationships: [
          {
            foreignKeyName: "employee_compensation_settings_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_compensation_assignments: {
        Row: EmployeeCompensationAssignmentRow;
        Insert: EmployeeCompensationAssignmentInsert;
        Update: EmployeeCompensationAssignmentUpdate;
        Relationships: [
          {
            foreignKeyName: "employee_compensation_assignments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_compensation_assignments_compensation_plan_id_fkey";
            columns: ["compensation_plan_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_reporting_periods: {
        Row: EmployeeReportingPeriodRow;
        Insert: EmployeeReportingPeriodInsert;
        Update: EmployeeReportingPeriodUpdate;
        Relationships: [
          {
            foreignKeyName: "employee_reporting_periods_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_reporting_periods_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: JobRow;
        Insert: JobInsert;
        Update: JobUpdate;
        Relationships: [
          {
            foreignKeyName: "jobs_sales_designer_id_fkey";
            columns: ["sales_designer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_compensation_plan_id_fkey";
            columns: ["compensation_plan_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_compensation_plan_version_id_fkey";
            columns: ["compensation_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      job_financial_adjustments: {
        Row: JobFinancialAdjustmentRow;
        Insert: JobFinancialAdjustmentInsert;
        Update: JobFinancialAdjustmentUpdate;
        Relationships: [
          {
            foreignKeyName: "job_financial_adjustments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_financial_adjustments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      job_change_orders: {
        Row: JobChangeOrderRow;
        Insert: JobChangeOrderInsert;
        Update: JobChangeOrderUpdate;
        Relationships: [
          {
            foreignKeyName: "job_change_orders_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_change_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_audits: {
        Row: CommissionAuditRow;
        Insert: CommissionAuditInsert;
        Update: CommissionAuditUpdate;
        Relationships: [
          {
            foreignKeyName: "commission_audits_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_audits_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_audits_finalized_by_fkey";
            columns: ["finalized_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: AuditEventRow;
        Insert: AuditEventInsert;
        Update: AuditEventUpdate;
        Relationships: [
          {
            foreignKeyName: "audit_events_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_settings: {
        Row: CommissionSettingsRow;
        Insert: CommissionSettingsInsert;
        Update: CommissionSettingsUpdate;
        Relationships: [
          {
            foreignKeyName: "commission_settings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_draw_periods: {
        Row: EmployeeDrawPeriodRow;
        Insert: EmployeeDrawPeriodInsert;
        Update: EmployeeDrawPeriodUpdate;
        Relationships: [
          {
            foreignKeyName: "employee_draw_periods_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_draw_ledger: {
        Row: EmployeeDrawLedgerRow;
        Insert: EmployeeDrawLedgerInsert;
        Update: EmployeeDrawLedgerUpdate;
        Relationships: [
          {
            foreignKeyName: "employee_draw_ledger_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_draw_ledger_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_draw_ledger_commission_event_id_fkey";
            columns: ["commission_event_id"];
            isOneToOne: false;
            referencedRelation: "commission_events";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_rollover_ledger: {
        Row: CommissionRolloverLedgerRow;
        Insert: CommissionRolloverLedgerInsert;
        Update: CommissionRolloverLedgerUpdate;
        Relationships: [
          {
            foreignKeyName: "commission_rollover_ledger_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_rollover_ledger_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_rollover_ledger_commission_event_id_fkey";
            columns: ["commission_event_id"];
            isOneToOne: false;
            referencedRelation: "commission_events";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_events: {
        Row: CommissionEventRow;
        Insert: CommissionEventInsert;
        Update: CommissionEventUpdate;
        Relationships: [
          {
            foreignKeyName: "commission_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_events_compensation_plan_id_fkey";
            columns: ["compensation_plan_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_events_compensation_plan_version_id_fkey";
            columns: ["compensation_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "compensation_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: DepartmentRow;
        Insert: DepartmentInsert;
        Update: DepartmentUpdate;
        Relationships: [
          {
            foreignKeyName: "departments_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      department_leaders: {
        Row: DepartmentLeaderRow;
        Insert: DepartmentLeaderInsert;
        Update: DepartmentLeaderUpdate;
        Relationships: [
          {
            foreignKeyName: "department_leaders_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "department_leaders_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      business_roles: {
        Row: BusinessRoleRow;
        Insert: BusinessRoleInsert;
        Update: BusinessRoleUpdate;
        Relationships: [
          {
            foreignKeyName: "business_roles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      app_modules: {
        Row: AppModuleRow;
        Insert: AppModuleInsert;
        Update: AppModuleUpdate;
        Relationships: [];
      };
      role_modules: {
        Row: RoleModuleRow;
        Insert: RoleModuleInsert;
        Update: RoleModuleUpdate;
        Relationships: [
          {
            foreignKeyName: "role_modules_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "app_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      dashboard_widgets: {
        Row: DashboardWidgetRow;
        Insert: DashboardWidgetInsert;
        Update: DashboardWidgetUpdate;
        Relationships: [];
      };
      role_dashboard_widgets: {
        Row: RoleDashboardWidgetRow;
        Insert: RoleDashboardWidgetInsert;
        Update: RoleDashboardWidgetUpdate;
        Relationships: [
          {
            foreignKeyName: "role_dashboard_widgets_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_dashboard_widgets_widget_id_fkey";
            columns: ["widget_id"];
            isOneToOne: false;
            referencedRelation: "dashboard_widgets";
            referencedColumns: ["id"];
          },
        ];
      };
      quick_actions: {
        Row: QuickActionRow;
        Insert: QuickActionInsert;
        Update: QuickActionUpdate;
        Relationships: [];
      };
      role_quick_actions: {
        Row: RoleQuickActionRow;
        Insert: RoleQuickActionInsert;
        Update: RoleQuickActionUpdate;
        Relationships: [
          {
            foreignKeyName: "role_quick_actions_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_quick_actions_quick_action_id_fkey";
            columns: ["quick_action_id"];
            isOneToOne: false;
            referencedRelation: "quick_actions";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_items: {
        Row: KnowledgeItemRow;
        Insert: KnowledgeItemInsert;
        Update: KnowledgeItemUpdate;
        Relationships: [
          {
            foreignKeyName: "knowledge_items_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_items_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_item_roles: {
        Row: KnowledgeItemRoleRow;
        Insert: KnowledgeItemRoleInsert;
        Update: KnowledgeItemRoleUpdate;
        Relationships: [
          {
            foreignKeyName: "knowledge_item_roles_knowledge_item_id_fkey";
            columns: ["knowledge_item_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_item_roles_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_measurables: {
        Row: PerformanceMeasurableRow;
        Insert: PerformanceMeasurableInsert;
        Update: PerformanceMeasurableUpdate;
        Relationships: [
          {
            foreignKeyName: "performance_measurables_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_measurables_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_measurables_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_measurables_knowledge_item_id_fkey";
            columns: ["knowledge_item_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_items";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_scorecard_entries: {
        Row: PerformanceScorecardEntryRow;
        Insert: PerformanceScorecardEntryInsert;
        Update: PerformanceScorecardEntryUpdate;
        Relationships: [
          {
            foreignKeyName: "performance_scorecard_entries_measurable_id_fkey";
            columns: ["measurable_id"];
            isOneToOne: false;
            referencedRelation: "performance_measurables";
            referencedColumns: ["id"];
          },
        ];
      };
      quarterly_priorities: {
        Row: QuarterlyPriorityRow;
        Insert: QuarterlyPriorityInsert;
        Update: QuarterlyPriorityUpdate;
        Relationships: [
          {
            foreignKeyName: "quarterly_priorities_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quarterly_priorities_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quarterly_priorities_knowledge_item_id_fkey";
            columns: ["knowledge_item_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_items";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_templates: {
        Row: MeetingTemplateRow;
        Insert: MeetingTemplateInsert;
        Update: MeetingTemplateUpdate;
        Relationships: [
          {
            foreignKeyName: "meeting_templates_team_department_id_fkey";
            columns: ["team_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_template_participants: {
        Row: MeetingTemplateParticipantRow;
        Insert: MeetingTemplateParticipantInsert;
        Update: MeetingTemplateParticipantUpdate;
        Relationships: [
          {
            foreignKeyName: "meeting_template_participants_meeting_template_id_fkey";
            columns: ["meeting_template_id"];
            isOneToOne: false;
            referencedRelation: "meeting_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_template_participants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_agenda_sections: {
        Row: MeetingAgendaSectionRow;
        Insert: MeetingAgendaSectionInsert;
        Update: MeetingAgendaSectionUpdate;
        Relationships: [
          {
            foreignKeyName: "meeting_agenda_sections_meeting_template_id_fkey";
            columns: ["meeting_template_id"];
            isOneToOne: false;
            referencedRelation: "meeting_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      meetings: {
        Row: MeetingRow;
        Insert: MeetingInsert;
        Update: MeetingUpdate;
        Relationships: [
          {
            foreignKeyName: "meetings_meeting_template_id_fkey";
            columns: ["meeting_template_id"];
            isOneToOne: false;
            referencedRelation: "meeting_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meetings_team_department_id_fkey";
            columns: ["team_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_participants: {
        Row: MeetingParticipantRow;
        Insert: MeetingParticipantInsert;
        Update: MeetingParticipantUpdate;
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_participants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_headlines: {
        Row: MeetingHeadlineRow;
        Insert: MeetingHeadlineInsert;
        Update: MeetingHeadlineUpdate;
        Relationships: [
          {
            foreignKeyName: "meeting_headlines_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meeting_headlines_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      issues: {
        Row: IssueRow;
        Insert: IssueInsert;
        Update: IssueUpdate;
        Relationships: [
          {
            foreignKeyName: "issues_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
        ];
      };
      issue_notes: {
        Row: IssueNoteRow;
        Insert: IssueNoteInsert;
        Update: IssueNoteUpdate;
        Relationships: [
          {
            foreignKeyName: "issue_notes_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      action_items: {
        Row: ActionItemRow;
        Insert: ActionItemInsert;
        Update: ActionItemUpdate;
        Relationships: [
          {
            foreignKeyName: "action_items_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_items_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
        ];
      };
      decisions: {
        Row: DecisionRow;
        Insert: DecisionInsert;
        Update: DecisionUpdate;
        Relationships: [
          {
            foreignKeyName: "decisions_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_reviews: {
        Row: PerformanceReviewRow;
        Insert: PerformanceReviewInsert;
        Update: PerformanceReviewUpdate;
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_reviews_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      performance_review_manager_notes: {
        Row: PerformanceReviewManagerNoteRow;
        Insert: PerformanceReviewManagerNoteInsert;
        Update: PerformanceReviewManagerNoteUpdate;
        Relationships: [
          {
            foreignKeyName: "performance_review_manager_notes_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "performance_reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_agent_configs: {
        Row: AiAgentConfigRow;
        Insert: AiAgentConfigInsert;
        Update: AiAgentConfigUpdate;
        Relationships: [];
      };
      ai_role_agents: {
        Row: AiRoleAgentRow;
        Insert: AiRoleAgentInsert;
        Update: AiRoleAgentUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_role_agents_business_role_id_fkey";
            columns: ["business_role_id"];
            isOneToOne: false;
            referencedRelation: "business_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: AiConversationRow;
        Insert: AiConversationInsert;
        Update: AiConversationUpdate;
        Relationships: [];
      };
      ai_messages: {
        Row: AiMessageRow;
        Insert: AiMessageInsert;
        Update: AiMessageUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_runs: {
        Row: AiRunRow;
        Insert: AiRunInsert;
        Update: AiRunUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_run_steps: {
        Row: AiRunStepRow;
        Insert: AiRunStepInsert;
        Update: AiRunStepUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_run_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "ai_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_artifacts: {
        Row: AiArtifactRow;
        Insert: AiArtifactInsert;
        Update: AiArtifactUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_artifacts_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "ai_runs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      can_manage_meeting: {
        Args: { target_meeting_id: string };
        Returns: boolean;
      };
      can_view_meeting: {
        Args: { target_meeting_id: string };
        Returns: boolean;
      };
      is_meeting_participant: {
        Args: { target_meeting_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
