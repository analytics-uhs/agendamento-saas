import type { AppointmentSource, AppointmentStatus, BusinessRole, DurationMode, ThemePreference } from "@/types/database";

export type PlatformMetrics = {
  totalBusinesses: number;
  activeBusinesses: number;
  inactiveBusinesses: number;
  appointmentsToday: number;
  futureAppointments: number;
  newBusinesses30Days: number;
};

export type PlatformBusinessSummary = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  memberCount: number;
  appointmentCount: number;
  nextAppointment: string | null;
};

export type PlatformBusinessPage = {
  items: PlatformBusinessSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PlatformBusinessDetail = {
  business: {
    id: string;
    name: string;
    slug: string;
    whatsapp: string | null;
    logoUrl: string | null;
    active: boolean;
    createdAt: string;
    updatedAt: string;
    activeUpdatedAt: string | null;
    activeUpdatedBy: string | null;
  };
  settings: {
    durationMode: DurationMode;
    fixedDurationMinutes: number;
    allowMultipleBlocks: boolean;
    palette: { id?: string; primary?: string; accent?: string };
    themePreference: ThemePreference;
  } | null;
  groups: {
    position: 1 | 2;
    label: string;
    active: boolean;
    required: boolean;
    options: { id: string; name: string; durationMinutes: number | null; active: boolean }[];
  }[];
  hours: { weekday: number; active: boolean; startTime: string; endTime: string }[];
  members: { id: string; userId: string; name: string; email: string | null; role: BusinessRole; createdAt: string }[];
  appointmentSummary: { today: number; future: number; completed: number; cancelled: number; noShow: number };
  recentAppointments: {
    id: string;
    customerName: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    source: AppointmentSource;
    group1Name: string | null;
    group2Name: string | null;
  }[];
};

export type BusinessStatusFilter = "all" | "active" | "inactive";
export type PlatformBusinessQuery = { search: string; status: BusinessStatusFilter; page: number };

