export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type BusinessRole = "owner" | "admin";
export type DurationMode = "fixed" | "fixed_multiple" | "group_2";
export type ThemePreference = "light" | "dark" | "system";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; whatsapp: string | null } & Timestamps;
        Insert: { id: string; name?: string; whatsapp?: string | null; created_at?: string; updated_at?: string };
        Update: { name?: string; whatsapp?: string | null; updated_at?: string };
        Relationships: [];
      };
      businesses: {
        Row: { id: string; name: string; slug: string; whatsapp: string | null; logo_url: string | null; active: boolean } & Timestamps;
        Insert: { id?: string; name: string; slug: string; whatsapp?: string | null; logo_url?: string | null; active?: boolean; created_at?: string; updated_at?: string };
        Update: { name?: string; slug?: string; whatsapp?: string | null; logo_url?: string | null; active?: boolean; updated_at?: string };
        Relationships: [];
      };
      business_members: {
        Row: { id: string; business_id: string; user_id: string; role: BusinessRole; created_at: string };
        Insert: { id?: string; business_id: string; user_id: string; role: BusinessRole; created_at?: string };
        Update: { business_id?: string; user_id?: string; role?: BusinessRole };
        Relationships: [{ foreignKeyName: "business_members_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
      booking_groups: {
        Row: { id: string; business_id: string; position: number; label: string; active: boolean; required: boolean; sort_order: number } & Timestamps;
        Insert: { id?: string; business_id: string; position: number; label: string; active?: boolean; required?: boolean; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { position?: number; label?: string; active?: boolean; required?: boolean; sort_order?: number; updated_at?: string };
        Relationships: [{ foreignKeyName: "booking_groups_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
      booking_options: {
        Row: { id: string; business_id: string; group_id: string; name: string; duration_minutes: number | null; active: boolean; sort_order: number } & Timestamps;
        Insert: { id?: string; business_id: string; group_id: string; name: string; duration_minutes?: number | null; active?: boolean; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { group_id?: string; name?: string; duration_minutes?: number | null; active?: boolean; sort_order?: number; updated_at?: string };
        Relationships: [{ foreignKeyName: "booking_options_group_tenant_fk"; columns: ["group_id", "business_id"]; isOneToOne: false; referencedRelation: "booking_groups"; referencedColumns: ["id", "business_id"] }];
      };
      business_hours: {
        Row: { id: string; business_id: string; weekday: number; active: boolean; start_time: string; end_time: string } & Timestamps;
        Insert: { id?: string; business_id: string; weekday: number; active?: boolean; start_time?: string; end_time?: string; created_at?: string; updated_at?: string };
        Update: { active?: boolean; start_time?: string; end_time?: string; updated_at?: string };
        Relationships: [{ foreignKeyName: "business_hours_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
      business_settings: {
        Row: { business_id: string; duration_mode: DurationMode; fixed_duration_minutes: number; allow_multiple_blocks: boolean; palette: Json; theme_preference: ThemePreference } & Timestamps;
        Insert: { business_id: string; duration_mode?: DurationMode; fixed_duration_minutes?: number; allow_multiple_blocks?: boolean; palette?: Json; theme_preference?: ThemePreference; created_at?: string; updated_at?: string };
        Update: { duration_mode?: DurationMode; fixed_duration_minutes?: number; allow_multiple_blocks?: boolean; palette?: Json; theme_preference?: ThemePreference; updated_at?: string };
        Relationships: [{ foreignKeyName: "business_settings_business_id_fkey"; columns: ["business_id"]; isOneToOne: true; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
      appointments: {
        Row: { id: string; business_id: string; group_1_option_id: string | null; group_2_option_id: string | null; customer_name: string; customer_whatsapp: string; appointment_date: string; start_time: string; end_time: string; duration_minutes: number; status: AppointmentStatus; created_at: string; created_by: string | null };
        Insert: { id?: string; business_id: string; group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name: string; customer_whatsapp: string; appointment_date: string; start_time: string; end_time: string; duration_minutes: number; status?: AppointmentStatus; created_at?: string; created_by?: string | null };
        Update: { group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name?: string; customer_whatsapp?: string; appointment_date?: string; start_time?: string; end_time?: string; duration_minutes?: number; status?: AppointmentStatus; created_by?: string | null };
        Relationships: [{ foreignKeyName: "appointments_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_business_onboarding: { Args: { p_payload: Json }; Returns: string };
      create_public_appointment: { Args: { p_slug: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null; p_date: string; p_start_time: string; p_blocks: number; p_customer_name: string; p_customer_whatsapp: string }; Returns: Json };
      create_business_with_owner: { Args: { p_name: string; p_slug: string; p_whatsapp?: string | null }; Returns: string };
      get_booking_availability: { Args: { p_slug: string; p_date: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null }; Returns: Json };
      get_public_booking_page: { Args: { p_slug: string }; Returns: Json };
    };
    Enums: {
      business_role: BusinessRole;
      duration_mode: DurationMode;
      theme_preference: ThemePreference;
      appointment_status: AppointmentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
