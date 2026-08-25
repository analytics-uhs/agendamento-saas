import assert from "node:assert/strict";
import test from "node:test";
import { FOUNDER_OFFER, MARKETING_TRIAL_HREF, founderOfferAvailability } from "./marketing";

test("centraliza a oferta Fundadores aprovada", () => {
  assert.deepEqual(founderOfferAvailability(), {
    totalSpots: 50,
    availableSpots: 38,
    occupiedSpots: 12,
    occupiedPercentage: 24,
  });
  assert.equal(FOUNDER_OFFER.currentPrice, "39,90");
  assert.equal(FOUNDER_OFFER.officialPrice, "59,90");
  assert.equal(MARKETING_TRIAL_HREF, "/onboarding");
});

test("limita valores inválidos sem produzir progresso impossível", () => {
  assert.deepEqual(founderOfferAvailability(50, 80), {
    totalSpots: 50,
    availableSpots: 50,
    occupiedSpots: 0,
    occupiedPercentage: 0,
  });
  assert.deepEqual(founderOfferAvailability(0, -2), {
    totalSpots: 0,
    availableSpots: 0,
    occupiedSpots: 0,
    occupiedPercentage: 0,
  });
});
