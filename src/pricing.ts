import type { ProfileRecord, RetailerListing } from "./schema";

/** Promo requirements a typical shopper can meet for free. Paid ones are shown but never used for ranking. */
const FREE_REQUIREMENTS = new Set(["none", "free-membership", "code", "minimum-spend"]);

/** Phrases that cancel promos for an item. */
const EXCLUSION_PATTERNS = [/discounts? do not apply/i, /price as marked/i, /excluded from (all )?promotions?/i, /not eligible for (coupons|discounts|promotions)/i];

export type PricedListing = RetailerListing & {
  youPay: number | null;
  promoApplied: boolean;
  promoBlockedBy: string | null;
  /** Can this row be named "cheapest"? */
  eligibleForBest: boolean;
  ineligibleReason: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function promoIsBlocked(listing: RetailerListing): string | null {
  if (!listing.exclusions) return null;
  return EXCLUSION_PATTERNS.some((p) => p.test(listing.exclusions!)) ? listing.exclusions : null;
}

export function priceListing(listing: RetailerListing): PricedListing {
  const base = listing.displayedPrice;
  let youPay = base;
  let promoApplied = false;
  const blockedBy = listing.promo ? promoIsBlocked(listing) : null;

  if (base !== null && listing.promo && !blockedBy && FREE_REQUIREMENTS.has(listing.promo.requires)) {
    let p = base;
    if (listing.promo.percentOff) p = p * (1 - listing.promo.percentOff / 100);
    if (listing.promo.amountOff) p = p - listing.promo.amountOff;
    youPay = Math.max(0, p);
    promoApplied = youPay < base;
  }
  if (youPay !== null && listing.shippingCost) youPay += listing.shippingCost;
  if (youPay !== null) youPay = round2(youPay);

  let ineligibleReason: string | null = null;
  if (youPay === null) ineligibleReason = "No price found";
  else if (listing.available === false) ineligibleReason = "Sold out";
  else if (listing.kind === "resale") ineligibleReason = "Resale, shown separately";
  else if (listing.confidence !== "confirmed") ineligibleReason = "Likely match, not confirmed";
  else if (listing.priceSource !== "product-page") ineligibleReason = "Price not read from the product page";
  else if (listing.isSearchLink) ineligibleReason = "No single product page";

  return { ...listing, youPay, promoApplied, promoBlockedBy: blockedBy, eligibleForBest: ineligibleReason === null, ineligibleReason };
}

export type PriceSummary = {
  rows: PricedListing[];
  best: PricedListing | null;
  /** Next-cheapest eligible row, for "about $X below <retailer>". */
  runnerUp: PricedListing | null;
  inputRow: PricedListing | null;
};

/** Ranks by what you actually pay. Rows without a price sink to the bottom. */
export function summarizePrices(record: Pick<ProfileRecord, "retailers">): PriceSummary {
  const rows = record.retailers
    .map(priceListing)
    .sort((a, b) => (a.youPay ?? Infinity) - (b.youPay ?? Infinity) || a.retailer.localeCompare(b.retailer));
  const eligible = rows.filter((r) => r.eligibleForBest);
  return {
    rows,
    best: eligible[0] ?? null,
    runnerUp: eligible.find((r) => r.retailer !== eligible[0]?.retailer) ?? null,
    inputRow: rows.find((r) => r.isInputLink) ?? null,
  };
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isStale(checkedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - Date.parse(checkedAt) > STALE_AFTER_MS;
}

export function formatUsd(n: number | null): string {
  if (n === null) return "n/a";
  return "$" + (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
