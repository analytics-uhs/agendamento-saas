import type {
  AppointmentSource,
  AppointmentStatus,
  BookingGroupOccupancyMode,
} from "@/types/database";

export type Reservation = {
  id: string;
  businessId: string;
  customerName: string;
  customerWhatsapp: string;
  source: AppointmentSource;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationResource = {
  id: string;
  reservationId: string;
  businessId: string;
  groupId: string;
  optionId: string;
  occupancyMode: BookingGroupOccupancyMode;
  reservationDate: string;
  startTime: string | null;
  endTime: string | null;
  status: AppointmentStatus;
  optionNameSnapshot: string;
  groupNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
};

export type ResourceAllocation = {
  id: string;
  businessId: string;
  optionId: string;
  reservationResourceId: string;
  occupancyMode: BookingGroupOccupancyMode;
  allocationDate: string;
  startTime: string | null;
  endTime: string | null;
  occupiedPeriod: string;
  active: boolean;
  createdAt: string;
};
