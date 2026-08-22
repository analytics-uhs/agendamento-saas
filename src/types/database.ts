export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type BusinessRole = "owner" | "admin";
export type DurationMode = "fixed" | "fixed_multiple" | "group_2";
export type ThemePreference = "light" | "dark" | "system";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type AppointmentSource = "public" | "admin";
export type AdminNotificationType = "new_public_appointment";

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
        Row: { id: string; name: string; slug: string; whatsapp: string | null; logo_url: string | null; address: string | null; google_maps_url: string | null; instagram_url: string | null; facebook_url: string | null; active: boolean; active_updated_at: string | null; active_updated_by: string | null } & Timestamps;
        Insert: { id?: string; name: string; slug: string; whatsapp?: string | null; logo_url?: string | null; address?: string | null; google_maps_url?: string | null; instagram_url?: string | null; facebook_url?: string | null; active?: boolean; active_updated_at?: string | null; active_updated_by?: string | null; created_at?: string; updated_at?: string };
        Update: { name?: string; slug?: string; whatsapp?: string | null; logo_url?: string | null; address?: string | null; google_maps_url?: string | null; instagram_url?: string | null; facebook_url?: string | null; active?: boolean; active_updated_at?: string | null; active_updated_by?: string | null; updated_at?: string };
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
        Row: { id: string; business_id: string; group_1_option_id: string | null; group_2_option_id: string | null; customer_name: string; customer_whatsapp: string; appointment_date: string; start_time: string; end_time: string; duration_minutes: number; status: AppointmentStatus; source: AppointmentSource; created_at: string; created_by: string | null; reminder_sent_at: string | null; reminder_sent_by: string | null; series_id: string | null };
        Insert: { id?: string; business_id: string; group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name: string; customer_whatsapp: string; appointment_date: string; start_time: string; end_time: string; duration_minutes: number; status?: AppointmentStatus; source?: AppointmentSource; created_at?: string; created_by?: string | null; reminder_sent_at?: string | null; reminder_sent_by?: string | null; series_id?: string | null };
        Update: { group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name?: string; customer_whatsapp?: string; appointment_date?: string; start_time?: string; end_time?: string; duration_minutes?: number; status?: AppointmentStatus; source?: AppointmentSource; created_by?: string | null; reminder_sent_at?: string | null; reminder_sent_by?: string | null; series_id?: string | null };
        Relationships: [{ foreignKeyName: "appointments_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }, { foreignKeyName: "appointments_series_tenant_fk"; columns: ["series_id", "business_id"]; isOneToOne: false; referencedRelation: "appointment_series"; referencedColumns: ["id", "business_id"] }];
      };
      appointment_series: {
        Row: { id: string; business_id: string; group_1_option_id: string | null; group_2_option_id: string | null; customer_name: string; customer_whatsapp: string; weekday: number; start_time: string; duration_minutes: number; blocks: number; starts_on: string; repeat_count: number | null; active: boolean; created_by: string | null } & Timestamps;
        Insert: { id?: string; business_id: string; group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name: string; customer_whatsapp: string; weekday: number; start_time: string; duration_minutes: number; blocks: number; starts_on: string; repeat_count?: number | null; active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { business_id?: string; group_1_option_id?: string | null; group_2_option_id?: string | null; customer_name?: string; customer_whatsapp?: string; weekday?: number; start_time?: string; duration_minutes?: number; blocks?: number; starts_on?: string; repeat_count?: number | null; active?: boolean; created_by?: string | null; updated_at?: string };
        Relationships: [];
      };
      admin_notifications: {
        Row: { id: string; business_id: string; user_id: string; type: AdminNotificationType; title: string; message: string; appointment_id: string | null; read_at: string | null; push_dispatched_at: string | null; created_at: string };
        Insert: { id?: string; business_id: string; user_id: string; type: AdminNotificationType; title: string; message: string; appointment_id?: string | null; read_at?: string | null; push_dispatched_at?: string | null; created_at?: string };
        Update: { read_at?: string | null; push_dispatched_at?: string | null };
        Relationships: [{ foreignKeyName: "admin_notifications_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }, { foreignKeyName: "admin_notifications_appointment_id_fkey"; columns: ["appointment_id"]; isOneToOne: false; referencedRelation: "appointments"; referencedColumns: ["id"] }];
      };
      push_subscriptions: {
        Row: { id: string; user_id: string; business_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null } & Timestamps;
        Insert: { id?: string; user_id: string; business_id: string; endpoint: string; p256dh: string; auth: string; user_agent?: string | null; created_at?: string; updated_at?: string };
        Update: { p256dh?: string; auth?: string; user_agent?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "push_subscriptions_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "businesses"; referencedColumns: ["id"] }];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_business_onboarding: { Args: { p_payload: Json }; Returns: string };
      create_admin_appointment: { Args: { p_group_1_option_id: string | null; p_group_2_option_id: string | null; p_date: string; p_start_time: string; p_blocks: number; p_customer_name: string; p_customer_whatsapp: string }; Returns: Json };
      create_public_appointment: { Args: { p_slug: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null; p_date: string; p_start_time: string; p_blocks: number; p_customer_name: string; p_customer_whatsapp: string }; Returns: Json };
      create_business_with_owner: { Args: { p_name: string; p_slug: string; p_whatsapp?: string | null }; Returns: string };
      get_booking_availability: { Args: { p_slug: string; p_date: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null }; Returns: Json };
      get_admin_appointment_edit_availability: { Args: { p_appointment_id: string; p_date: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null }; Returns: Json };
      get_public_booking_page: { Args: { p_slug: string }; Returns: Json };
      get_platform_business_detail: { Args: { p_business_id: string }; Returns: Json };
      get_platform_metrics: { Args: Record<PropertyKey, never>; Returns: Json };
      is_current_user_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      list_platform_businesses: { Args: { p_search?: string | null; p_active?: boolean | null; p_page?: number; p_page_size?: number }; Returns: Json };
      mark_appointment_reminder_sent: { Args: { p_appointment_id: string }; Returns: string };
      mark_admin_notification_read: { Args: { p_notification_id: string }; Returns: string };
      mark_all_admin_notifications_read: { Args: { p_business_id: string }; Returns: number };
      save_push_subscription: { Args: { p_business_id: string; p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }; Returns: string };
      remove_push_subscription: { Args: { p_endpoint: string }; Returns: boolean };
      claim_pending_admin_push_notifications: { Args: { p_business_slug: string }; Returns: { notification_id: string; business_id: string; user_id: string; title: string; message: string; appointment_id: string | null }[] };
      replace_business_hours: { Args: { p_hours: Json }; Returns: boolean };
      create_recurring_appointment_series: { Args: { p_group_1_option_id: string | null; p_group_2_option_id: string | null; p_starts_on: string; p_start_time: string; p_blocks: number; p_customer_name: string; p_customer_whatsapp: string; p_repeat_count?: number | null }; Returns: Json };
      materialize_recurring_appointments: { Args: { p_series_id: string; p_horizon_date?: string | null }; Returns: Json };
      cancel_recurring_appointment: { Args: { p_appointment_id: string; p_scope: string }; Returns: Json };
      set_appointment_status: { Args: { p_appointment_id: string; p_status: AppointmentStatus }; Returns: boolean };
      update_admin_appointment_occurrence: { Args: { p_appointment_id: string; p_group_1_option_id: string | null; p_group_2_option_id: string | null; p_date: string; p_start_time: string; p_blocks: number; p_customer_name: string; p_customer_whatsapp: string }; Returns: boolean };
      set_platform_business_active: { Args: { p_business_id: string; p_active: boolean }; Returns: Json };
    };
    Enums: {
      business_role: BusinessRole;
      duration_mode: DurationMode;
      theme_preference: ThemePreference;
      appointment_status: AppointmentStatus;
      appointment_source: AppointmentSource;
    };
    CompositeTypes: Record<string, never>;
  };
}
