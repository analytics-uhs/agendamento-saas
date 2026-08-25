import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDER_OFFER,
  FOUNDER_OFFER_FALLBACK,
  MARKETING_TRIAL_HREF,
  founderOfferAvailability,
  normalizeFounderOfferAvailability,
} from "./marketing";

test("centraliza a oferta Fundadores aprovada", () => {
  assert.deepEqual(founderOfferAvailability(), {
    totalSpots: 50,
    occupiedSpots: 38,
    availableSpots: 12,
    occupiedPercentage: 76,
  });
  assert.equal(FOUNDER_OFFER.currentPrice, "39,90");
  assert.equal(FOUNDER_OFFER.nextPrice, "49,90");
  assert.equal(FOUNDER_OFFER.officialPrice, "59,90");
  assert.equal(MARKETING_TRIAL_HREF, "/onboarding");
});

test("soma negócios elegíveis ao baseline e limita a oferta a 50 vagas", () => {
  assert.deepEqual(founderOfferAvailability(1), {
    totalSpots: 50,
    occupiedSpots: 39,
    availableSpots: 11,
    occupiedPercentage: 78,
  });
  assert.deepEqual(founderOfferAvailability(5), {
    totalSpots: 50,
    occupiedSpots: 43,
    availableSpots: 7,
    occupiedPercentage: 86,
  });
  assert.deepEqual(founderOfferAvailability(12), {
    totalSpots: 50,
    occupiedSpots: 50,
    availableSpots: 0,
    occupiedPercentage: 100,
  });
  assert.deepEqual(founderOfferAvailability(20), {
    totalSpots: 50,
    occupiedSpots: 50,
    availableSpots: 0,
    occupiedPercentage: 100,
  });
});

test("normaliza somente os quatro agregados públicos e usa fallback seguro", () => {
  assert.deepEqual(normalizeFounderOfferAvailability(null), FOUNDER_OFFER_FALLBACK);
  assert.deepEqual(normalizeFounderOfferAvailability({ totalSpots: 50, occupiedSpots: 60, availableSpots: -10, occupiedPercentage: 120 }), FOUNDER_OFFER_FALLBACK);
  assert.deepEqual(normalizeFounderOfferAvailability({
    totalSpots: 50,
    occupiedSpots: 39,
    availableSpots: 11,
    occupiedPercentage: 78,
    businesses: [{ id: "sensitive", name: "Não deve sair" }],
  }), {
    totalSpots: 50,
    occupiedSpots: 39,
    availableSpots: 11,
    occupiedPercentage: 78,
  });
});
