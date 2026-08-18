import assert from "node:assert/strict";
import test from "node:test";
import { parsePlatformBusinessPage, parsePlatformBusinessQuery, parsePlatformMetrics } from "./super-admin";

test("normaliza busca, filtro e paginação do Super Admin", () => {
  assert.deepEqual(parsePlatformBusinessQuery({ q: "  Arena  ", status: "inactive", page: "3" }), { search: "Arena", status: "inactive", page: 3 });
  assert.deepEqual(parsePlatformBusinessQuery({ status: "invalid", page: "-2" }), { search: "", status: "all", page: 1 });
});

test("transforma métricas agregadas do banco", () => {
  assert.deepEqual(parsePlatformMetrics({
    total_businesses: 8, active_businesses: 6, inactive_businesses: 2,
    appointments_today: 4, future_appointments: 12, new_businesses_30_days: 3,
  }), {
    totalBusinesses: 8, activeBusinesses: 6, inactiveBusinesses: 2,
    appointmentsToday: 4, futureAppointments: 12, newBusinesses30Days: 3,
  });
});

test("transforma página de negócios sem calcular agregados no frontend", () => {
  const page = parsePlatformBusinessPage({
    items: [{ id: "business-id", name: "Arena", slug: "arena", active: true, created_at: "2026-08-18T10:00:00Z", member_count: 2, appointment_count: 9, next_appointment: "2026-08-20T09:00:00" }],
    total: 21, page: 2, page_size: 20, total_pages: 2,
  });
  assert.equal(page.items[0]?.memberCount, 2);
  assert.equal(page.items[0]?.appointmentCount, 9);
  assert.equal(page.totalPages, 2);
});

