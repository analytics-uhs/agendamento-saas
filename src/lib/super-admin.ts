import type { DurationMode, Json } from "@/types/database";
import type { BusinessStatusFilter, PlatformBusinessDetail, PlatformBusinessPage, PlatformBusinessQuery, PlatformMetrics } from "@/types/super-admin";
import { displayEndTime } from "@/lib/time-of-day";

function object(value: Json | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value: Json | undefined) { return typeof value === "string" ? value : null; }
function number(value: Json | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function boolean(value: Json | undefined) { return typeof value === "boolean" ? value : null; }

export function parsePlatformMetrics(value: Json | null): PlatformMetrics {
  const root = object(value ?? undefined);
  if (!root) throw new Error("Resposta de métricas inválida.");
  return {
    totalBusinesses: number(root.total_businesses) ?? 0,
    activeBusinesses: number(root.active_businesses) ?? 0,
    inactiveBusinesses: number(root.inactive_businesses) ?? 0,
    appointmentsToday: number(root.appointments_today) ?? 0,
    futureAppointments: number(root.future_appointments) ?? 0,
    newBusinesses30Days: number(root.new_businesses_30_days) ?? 0,
  };
}

export function parsePlatformBusinessPage(value: Json | null): PlatformBusinessPage {
  const root = object(value ?? undefined);
  if (!root) throw new Error("Resposta da listagem de negócios inválida.");
  const items = Array.isArray(root.items) ? root.items.flatMap((rawItem) => {
    const item = object(rawItem);
    if (!item || !text(item.id) || !text(item.name) || !text(item.slug) || boolean(item.active) === null || !text(item.created_at)) return [];
    return [{
      id: text(item.id)!,
      name: text(item.name)!,
      slug: text(item.slug)!,
      active: boolean(item.active)!,
      createdAt: text(item.created_at)!,
      memberCount: number(item.member_count) ?? 0,
      appointmentCount: number(item.appointment_count) ?? 0,
      nextAppointment: text(item.next_appointment),
    }];
  }) : [];
  return {
    items,
    total: number(root.total) ?? 0,
    page: number(root.page) ?? 1,
    pageSize: number(root.page_size) ?? 20,
    totalPages: number(root.total_pages) ?? 1,
  };
}

export function parsePlatformBusinessDetail(value: Json | null): PlatformBusinessDetail | null {
  const root = object(value ?? undefined);
  const business = object(root?.business);
  if (!root || !business || !text(business.id) || !text(business.name) || !text(business.slug) || boolean(business.active) === null || !text(business.created_at) || !text(business.updated_at)) return null;

  const settingsRaw = object(root.settings);
  const durationMode = settingsRaw?.duration_mode;
  const themePreference = settingsRaw?.theme_preference;
  const settings = settingsRaw && (durationMode === "fixed" || durationMode === "fixed_multiple" || durationMode === "group_2")
    && (themePreference === "light" || themePreference === "dark" || themePreference === "system")
    ? {
        durationMode: durationMode as DurationMode,
        fixedDurationMinutes: number(settingsRaw.fixed_duration_minutes) ?? 0,
        allowMultipleBlocks: boolean(settingsRaw.allow_multiple_blocks) ?? false,
        palette: (() => {
          const palette = object(settingsRaw.palette);
          return { id: text(palette?.id) ?? undefined, primary: text(palette?.primary) ?? undefined, accent: text(palette?.accent) ?? undefined };
        })(),
        themePreference: themePreference === "dark" ? "dark" as const : "light" as const,
      }
    : null;

  const groups = Array.isArray(root.groups) ? root.groups.flatMap((rawGroup) => {
    const group = object(rawGroup);
    if (!group || (group.position !== 1 && group.position !== 2) || !text(group.label) || boolean(group.active) === null) return [];
    const options = Array.isArray(group.options) ? group.options.flatMap((rawOption) => {
      const option = object(rawOption);
      if (!option || !text(option.id) || !text(option.name) || boolean(option.active) === null) return [];
      return [{ id: text(option.id)!, name: text(option.name)!, durationMinutes: number(option.duration_minutes), active: boolean(option.active)! }];
    }) : [];
    return [{ position: group.position as 1 | 2, label: text(group.label)!, active: boolean(group.active)!, required: boolean(group.required) ?? true, options }];
  }) : [];

  const hours = Array.isArray(root.hours) ? root.hours.flatMap((rawHour) => {
    const hour = object(rawHour);
    if (!hour || number(hour.weekday) === null || boolean(hour.active) === null || !text(hour.start_time) || !text(hour.end_time)) return [];
    return [{ weekday: number(hour.weekday)!, active: boolean(hour.active)!, startTime: text(hour.start_time)!.slice(0, 5), endTime: displayEndTime(text(hour.end_time)!) }];
  }) : [];

  const members = Array.isArray(root.members) ? root.members.flatMap((rawMember) => {
    const member = object(rawMember);
    if (!member || !text(member.id) || !text(member.user_id) || !text(member.name) || (member.role !== "owner" && member.role !== "admin") || !text(member.created_at)) return [];
    return [{ id: text(member.id)!, userId: text(member.user_id)!, name: text(member.name)!, email: text(member.email), role: member.role as "owner" | "admin", createdAt: text(member.created_at)! }];
  }) : [];

  const summary = object(root.appointment_summary);
  const recentAppointments = Array.isArray(root.recent_appointments) ? root.recent_appointments.flatMap((rawAppointment) => {
    const appointment = object(rawAppointment);
    if (!appointment || !text(appointment.id) || !text(appointment.customer_name) || !text(appointment.appointment_date) || !text(appointment.start_time) || !text(appointment.end_time)) return [];
    if (!(appointment.status === "scheduled" || appointment.status === "completed" || appointment.status === "cancelled" || appointment.status === "no_show")) return [];
    if (!(appointment.source === "public" || appointment.source === "admin")) return [];
    return [{
      id: text(appointment.id)!, customerName: text(appointment.customer_name)!, appointmentDate: text(appointment.appointment_date)!,
      startTime: text(appointment.start_time)!.slice(0, 5), endTime: displayEndTime(text(appointment.end_time)!),
      status: appointment.status as "scheduled" | "completed" | "cancelled" | "no_show", source: appointment.source as "public" | "admin", group1Name: text(appointment.group_1_name), group2Name: text(appointment.group_2_name),
    }];
  }) : [];

  return {
    business: {
      id: text(business.id)!, name: text(business.name)!, slug: text(business.slug)!, whatsapp: text(business.whatsapp), logoUrl: text(business.logo_url),
      address: null, googleMapsUrl: null, instagramUrl: null, facebookUrl: null,
      active: boolean(business.active)!, createdAt: text(business.created_at)!, updatedAt: text(business.updated_at)!,
      activeUpdatedAt: text(business.active_updated_at), activeUpdatedBy: text(business.active_updated_by),
    },
    settings,
    groups,
    hours,
    members,
    appointmentSummary: {
      today: number(summary?.today) ?? 0, future: number(summary?.future) ?? 0, completed: number(summary?.completed) ?? 0,
      cancelled: number(summary?.cancelled) ?? 0, noShow: number(summary?.no_show) ?? 0,
    },
    recentAppointments,
  };
}

export function parsePlatformBusinessQuery(input: { q?: string | string[]; status?: string | string[]; page?: string | string[] }): PlatformBusinessQuery {
  const rawSearch = Array.isArray(input.q) ? input.q[0] : input.q;
  const rawStatus = Array.isArray(input.status) ? input.status[0] : input.status;
  const rawPage = Array.isArray(input.page) ? input.page[0] : input.page;
  const status: BusinessStatusFilter = rawStatus === "active" || rawStatus === "inactive" ? rawStatus : "all";
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  return { search: (rawSearch ?? "").trim().slice(0, 80), status, page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1 };
}
