export const FOUNDER_OFFER = {
  totalSpots: 50,
  baselineOccupiedSpots: 38,
  currentPrice: "39,90",
  nextPrice: "49,90",
  officialPrice: "59,90",
} as const;

export const MARKETING_TRIAL_HREF = "/criar-conta";

export type FounderOfferAvailability = {
  totalSpots: number;
  occupiedSpots: number;
  availableSpots: number;
  occupiedPercentage: number;
};

export function founderOfferAvailability(
  eligibleBusinesses: number = 0,
  totalSpots: number = FOUNDER_OFFER.totalSpots,
  baselineOccupiedSpots: number = FOUNDER_OFFER.baselineOccupiedSpots,
): FounderOfferAvailability {
  const safeTotal = Math.max(0, Math.trunc(totalSpots));
  const safeBaseline = Math.min(safeTotal, Math.max(0, Math.trunc(baselineOccupiedSpots)));
  const safeEligible = Math.max(0, Math.trunc(eligibleBusinesses));
  const occupiedSpots = Math.min(safeTotal, safeBaseline + safeEligible);
  const availableSpots = Math.max(safeTotal - occupiedSpots, 0);
  const occupiedPercentage = safeTotal === 0 ? 0 : Math.round((occupiedSpots / safeTotal) * 100);

  return { totalSpots: safeTotal, occupiedSpots, availableSpots, occupiedPercentage };
}

export const FOUNDER_OFFER_FALLBACK = founderOfferAvailability();

export function normalizeFounderOfferAvailability(value: unknown): FounderOfferAvailability {
  if (!value || typeof value !== "object") return FOUNDER_OFFER_FALLBACK;

  const candidate = value as Record<string, unknown>;
  const totalSpots = Number(candidate.totalSpots);
  const occupiedSpots = Number(candidate.occupiedSpots);
  const availableSpots = Number(candidate.availableSpots);
  const occupiedPercentage = Number(candidate.occupiedPercentage);

  const isValid = [totalSpots, occupiedSpots, availableSpots, occupiedPercentage]
    .every((entry) => Number.isInteger(entry) && entry >= 0)
    && occupiedSpots <= totalSpots
    && availableSpots === totalSpots - occupiedSpots
    && occupiedPercentage === (totalSpots === 0 ? 0 : Math.round((occupiedSpots / totalSpots) * 100));

  if (!isValid) return FOUNDER_OFFER_FALLBACK;
  return { totalSpots, occupiedSpots, availableSpots, occupiedPercentage };
}
