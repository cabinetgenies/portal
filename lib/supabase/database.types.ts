/**
 * Minimal hand-maintained database types for Phase 1.
 *
 * Keep in sync with `supabase/migrations`. Once the Supabase CLI is linked to
 * the project, these can be regenerated with:
 *
 *   npx supabase gen types typescript --project-id <project-id> --schema public > lib/supabase/database.types.ts
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
