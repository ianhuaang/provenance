import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ProfileRecord, type RetailerListing } from "../src/schema";
import { priceListing, summarizePrices, isStale, formatUsd } from "../src/pricing";

const load = (name: string) => ProfileRecord.parse(JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")));

const base: RetailerListing = {
  retailer: "Test",
  label: "Online retailer",
  url: "https://example.com/p/1",
  kind: "retail",
  displayedPrice: 100,
  promo: null,
  exclusions: null,
  shippingCost: null,
  notes: "",
  available: null,
  confidence: "confirmed",
  priceSource: "product-page",
  isSearchLink: false,
  isInputLink: false,
  checkedAt: "2026-11-24T16:00:00Z",
};
const promo = (over: Partial<NonNullable<RetailerListing["promo"]>>) => ({
  description: "Sale",
  percentOff: null,
  amountOff: null,
  requires: "none" as const,
  code: null,
  inCart: false,
  endsAt: null,
  ...over,
});

describe("fixtures", () => {
  it("both prototype profiles validate against the schema", () => {
    expect(() => load("otto")).not.toThrow();
    expect(() => load("levi")).not.toThrow();
  });
});

describe("priceListing", () => {
  it("applies a free-membership in-cart percentage promo", () => {
    const r = priceListing({ ...base, displayedPrice: 449, promo: promo({ percentOff: 40, requires: "free-membership", inCart: true }) });
    expect(r.youPay).toBe(269.4);
    expect(r.promoApplied).toBe(true);
  });

  it("lets exclusions beat promos", () => {
    const r = priceListing({ ...base, displayedPrice: 489, promo: promo({ percentOff: 40 }), exclusions: "Price as Marked. Discounts Do Not Apply." });
    expect(r.youPay).toBe(489);
    expect(r.promoApplied).toBe(false);
    expect(r.promoBlockedBy).toMatch(/Discounts Do Not Apply/);
  });

  it("recognizes 'not eligible for coupons' as an exclusion", () => {
    const r = priceListing({ ...base, promo: promo({ percentOff: 15, requires: "code", code: "SAVE15" }), exclusions: "This product is not eligible for coupons." });
    expect(r.youPay).toBe(100);
  });

  it("ignores paid memberships and card offers for 'you pay'", () => {
    expect(priceListing({ ...base, promo: promo({ percentOff: 10, requires: "paid-membership" }) }).youPay).toBe(100);
    expect(priceListing({ ...base, promo: promo({ percentOff: 5, requires: "credit-card" }) }).youPay).toBe(100);
  });

  it("applies fixed-amount promos and adds known shipping", () => {
    const r = priceListing({ ...base, promo: promo({ amountOff: 25, requires: "code", code: "X" }), shippingCost: 9.99 });
    expect(r.youPay).toBe(84.99);
  });

  it("marks snippet prices, resale, likely matches and search links as not eligible for 'cheapest'", () => {
    expect(priceListing({ ...base, priceSource: "snippet" }).eligibleForBest).toBe(false);
    expect(priceListing({ ...base, kind: "resale" }).eligibleForBest).toBe(false);
    expect(priceListing({ ...base, confidence: "likely" }).eligibleForBest).toBe(false);
    expect(priceListing({ ...base, isSearchLink: true }).eligibleForBest).toBe(false);
    expect(priceListing({ ...base, displayedPrice: null }).eligibleForBest).toBe(false);
    expect(priceListing({ ...base, available: false }).ineligibleReason).toBe("Sold out");
  });
});

describe("summarizePrices on the prototypes", () => {
  it("Otto: cheapest is Urban Outfitters with free UO Rewards, ahead of Target", () => {
    const s = summarizePrices(load("otto"));
    expect(s.best?.retailer).toBe("Urban Outfitters");
    expect(s.best?.youPay).toBe(269.4);
    expect(s.runnerUp?.retailer).toBe("Target");
    expect(s.inputRow?.youPay).toBe(269.4);
  });

  it("Levi: Urban Outfitters' sitewide promo is blocked and the cheapest verified price is HomeSquare", () => {
    const s = summarizePrices(load("levi"));
    expect(s.inputRow?.youPay).toBe(489);
    expect(s.best?.retailer).toBe("HomeSquare");
    expect(s.best?.youPay).toBe(345.75);
    // Walmart's lower snippet price is shown but not named cheapest.
    expect(s.rows[0]?.retailer).toBe("Walmart");
    expect(s.rows[0]?.eligibleForBest).toBe(false);
  });
});

describe("helpers", () => {
  it("flags prices older than 24 hours as stale", () => {
    const now = new Date("2026-11-25T17:00:00Z");
    expect(isStale("2026-11-24T16:00:00Z", now)).toBe(true);
    expect(isStale("2026-11-25T01:00:00Z", now)).toBe(false);
  });
  it("formats money", () => {
    expect(formatUsd(269.4)).toBe("$269.40");
    expect(formatUsd(449)).toBe("$449");
    expect(formatUsd(1599)).toBe("$1,599");
  });
});
