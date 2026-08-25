export const FOUNDER_OFFER = {
  totalSpots: 50,
  availableSpots: 38,
  currentPrice: "39,90",
  nextPrice: "49,90",
  officialPrice: "59,90",
} as const;

export const MARKETING_TRIAL_HREF = "/onboarding";

export function founderOfferAvailability(
  totalSpots: number = FOUNDER_OFFER.totalSpots,
  availableSpots: number = FOUNDER_OFFER.availableSpots,
) {
  const safeTotal = Math.max(0, Math.trunc(totalSpots));
  const safeAvailable = Math.min(safeTotal, Math.max(0, Math.trunc(availableSpots)));
  const occupiedSpots = safeTotal - safeAvailable;
  const occupiedPercentage = safeTotal === 0 ? 0 : Math.round((occupiedSpots / safeTotal) * 100);

  return { totalSpots: safeTotal, availableSpots: safeAvailable, occupiedSpots, occupiedPercentage };
}
