import assert from "node:assert/strict";
import test from "node:test";
import { publicBookingMetadata } from "./public-booking-metadata";

const business = {
  id: "business-1",
  name: "Arena Central",
  slug: "arena-central",
  whatsapp: null,
  logoUrl: "https://example.supabase.co/storage/v1/object/public/business-logos/logo.webp",
  address: null,
  googleMapsUrl: null,
  instagramUrl: null,
  facebookUrl: null,
};

test("página pública usa nome e logo do negócio no metadata", () => {
  assert.deepEqual(publicBookingMetadata({ business }), {
    title: { absolute: "Arena Central | AgendaFácil" },
    description: "Escolha serviço, data e horário.",
    icons: { icon: [{ url: business.logoUrl }] },
  });
});

test("página pública sem logo preserva o favicon herdado", () => {
  const metadata = publicBookingMetadata({ business: { ...business, logoUrl: null } });
  assert.equal(metadata.icons, undefined);
  assert.deepEqual(metadata.title, { absolute: "Arena Central | AgendaFácil" });
});
