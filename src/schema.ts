import { z } from "zod";

/**
 * The profile record is the single source of truth for an item.
 * The research engine produces it; the site renders every page from it.
 * Prices the engine reports are raw facts (displayed price, promo, exclusions);
 * "you pay" is always computed in code (see pricing.ts), never by the model.
 */

export const Tier = z.enum(["designer", "brand-designed", "generic", "replica"]);
export type Tier = z.infer<typeof Tier>;

export const Confidence = z.enum(["confirmed", "likely"]);

export const Spec = z.object({
  label: z.string().describe("Spec name, e.g. 'Height' or 'Materials'"),
  value: z.string().describe("Value with units, e.g. '62 in' or 'MDF, rubberwood'"),
});

export const Source = z.object({
  title: z.string(),
  url: z.url(),
});

export const Promo = z.object({
  description: z.string().describe("The promo as the retailer states it, e.g. 'UO Rewards Early Access: 40% off sitewide, in cart'"),
  percentOff: z.number().min(0).max(100).nullable().describe("Percent discount, if the promo is a percentage"),
  amountOff: z.number().min(0).nullable().describe("Fixed amount off in USD, if the promo is a fixed amount"),
  requires: z
    .enum(["none", "free-membership", "paid-membership", "code", "credit-card", "minimum-spend"])
    .describe("What a shopper must do to get it"),
  code: z.string().nullable().describe("Promo code, if one is needed"),
  inCart: z.boolean().describe("True when the discount only appears in the cart, not on the product page"),
  endsAt: z.string().nullable().describe("End date if stated (ISO date), else null"),
});
export type Promo = z.infer<typeof Promo>;

export const RetailerListing = z.object({
  retailer: z.string().describe("Retailer name, e.g. 'Target'"),
  label: z.string().describe("Short line under the name, e.g. 'Sold by Target' or 'As \"Otto Floor Lamp\"'"),
  url: z.url().describe("Direct product page URL; a search URL only when no product page could be found"),
  kind: z.enum(["retail", "dealer", "resale"]).describe("resale = new-in-box or used from an individual"),
  displayedPrice: z.number().positive().nullable().describe("Price shown on the product page in USD, including marked-down sale prices"),
  promo: Promo.nullable().describe("Extra discount beyond the displayed price, if any"),
  exclusions: z
    .string()
    .nullable()
    .describe("Fine print that blocks promos for this item, quoted, e.g. 'Price as Marked. Discounts Do Not Apply.'"),
  shippingCost: z.number().min(0).nullable().describe("Shipping cost in USD when stated (0 for free), else null"),
  notes: z.string().describe("Anything else a shopper should know: stock, pre-order, returns, price matching"),
  available: z.boolean().nullable().describe("False when the page shows sold out or unavailable; null when it doesn't say"),
  confidence: Confidence.describe("'likely' when the listing matches on specs but identity is not fully confirmed"),
  priceSource: z
    .enum(["product-page", "snippet", "shopping-feed"])
    .describe("Where the price came from; only product-page prices are trusted for 'cheapest'"),
  isSearchLink: z.boolean().describe("True when url is a retailer search page, not a product page"),
  isInputLink: z.boolean().describe("True for the listing the user pasted"),
  checkedAt: z.iso.datetime(),
});
export type RetailerListing = z.infer<typeof RetailerListing>;

export const MatchRow = z.object({
  spec: z.string(),
  listing: z.string().describe("Value on the listing the user pasted"),
  canonical: z.string().describe("Value on the maker's (or canonical) listing"),
  matches: z.boolean(),
});

export const Identity = z.object({
  canonicalName: z.string().describe("Maker + product + finish, e.g. 'Adesso Orchard Floor Lamp, Natural Wood'"),
  shortName: z.string().describe("Name for headings, e.g. 'Adesso Orchard'"),
  maker: z.string(),
  makerLocation: z.string().nullable(),
  modelNumber: z.string().nullable().describe("Manufacturer model/part number, the key that ties listings together"),
  otherModelNumbers: z.array(z.object({ model: z.string(), note: z.string() })).describe("Other finishes or sizes"),
  upc: z.string().nullable(),
  listPrice: z.number().positive().nullable().describe("Maker's list price / MSRP in USD if known"),
});
export type Identity = z.infer<typeof Identity>;

export const Classification = z.object({
  tier: Tier,
  verdict: z.string().describe("Two to four words, e.g. 'Brand-designed, renamed'"),
  verdictNote: z.string().describe("One sentence under the verdict"),
  summary: z.string().describe("Two or three sentences explaining the classification"),
  designer: z
    .object({
      name: z.string().nullable(),
      credited: z.boolean(),
      note: z.string().describe("e.g. 'None credited; in-house design team'"),
    })
    .describe("Individual designer if any"),
  renamedByRetailer: z.boolean().describe("True when the pasted listing sells the product under a different name"),
  originalIfReplica: z.string().nullable().describe("For replicas: the original design and its authorized maker"),
});
export type Classification = z.infer<typeof Classification>;

export const Maker = z.object({
  name: z.string(),
  paragraphs: z.array(z.string()).min(1).max(3),
  timeline: z.array(z.object({ when: z.string(), what: z.string() })).max(5),
});

export const Photo = z.object({
  url: z.string().describe("Stored copy (data URI or library path) or remote URL"),
  credit: z.string(),
  sourceUrl: z.url(),
});

const WorthCheck = z.object({
  score: z.number().int().min(0).max(2).describe("2 good, 1 mixed, 0 poor"),
  note: z.string().describe("One plain sentence explaining the score"),
});
export const Worth = z
  .object({
    verdict: z.enum(["yes", "depends", "no"]),
    line: z.string().describe("One-sentence bottom line, e.g. 'Yes with UO Rewards: solid wood and linen at $269.'"),
    price: WorthCheck.describe("Your link vs other stores: 2 your link is the cheapest or the price is the same everywhere; 1 cheaper elsewhere, buy there; 0 the same item sells for far less elsewhere"),
    design: WorthCheck.describe("Design: 2 credited designer or a distinctive original; 1 the brand's own take on a common look; 0 generic factory design"),
    materials: WorthCheck.describe("Materials for the price: 2 solid materials for the money; 1 standard for the price; 0 cheap materials or short-lived parts for the price"),
  })
  .describe("Claude's opinion on whether it's worth buying. Resale value is not considered.");
export type Worth = z.infer<typeof Worth>;

export const ProfileRecord = z.object({
  id: z.string().describe("Stable slug, e.g. 'adesso-3932-12'"),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  checkedAt: z.iso.datetime().describe("When prices were last checked"),
  input: z.object({
    url: z.string(),
    resolvedUrl: z.string(),
    retailer: z.string(),
    listingName: z.string(),
  }),
  identity: Identity,
  classification: Classification,
  specs: z.array(Spec).min(1),
  match: z
    .object({
      confidence: Confidence,
      basis: z.string().describe("e.g. 'All 7 listed specs match' or 'Same model number'"),
      rows: z.array(MatchRow),
    })
    .nullable()
    .describe("Spec-by-spec evidence; required when the item is sold under another name"),
  quality: z.array(z.string()).min(1).max(3).describe("'What you're paying for' paragraphs"),
  retailers: z.array(RetailerListing).min(1),
  names: z.array(z.object({ source: z.string(), name: z.string(), likely: z.boolean() })),
  maker: Maker,
  photo: Photo.nullable(),
  sources: z.array(Source),
  worth: Worth.optional(),
});
export type ProfileRecord = z.infer<typeof ProfileRecord>;
