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
  department: string | null;
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
  manager_id?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<ProfileInsert>;

export type ProjectCategoryRow = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  minimum_gp_standard: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectCategoryInsert = {
  id?: string;
  name: string;
  code: string;
  active?: boolean;
  minimum_gp_standard?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type ProjectCategoryUpdate = Partial<ProjectCategoryInsert>;

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
  project_category_id: string;
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
  project_category_id: string;
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
      project_categories: {
        Row: ProjectCategoryRow;
        Insert: ProjectCategoryInsert;
        Update: ProjectCategoryUpdate;
        Relationships: [];
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
            foreignKeyName: "jobs_project_category_id_fkey";
            columns: ["project_category_id"];
            isOneToOne: false;
            referencedRelation: "project_categories";
            referencedColumns: ["id"];
          },
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
