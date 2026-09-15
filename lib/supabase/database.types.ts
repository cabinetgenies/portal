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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
