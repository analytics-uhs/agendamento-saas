import type { AdminNotificationType } from "@/types/database";

export type AdminNotification = {
  id: string;
  businessId: string;
  userId: string;
  type: AdminNotificationType;
  title: string;
  message: string;
  appointmentId: string | null;
  reservationResourceId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type AdminNotificationFeed = {
  items: AdminNotification[];
  unreadCount: number;
};

export type BrowserPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};
