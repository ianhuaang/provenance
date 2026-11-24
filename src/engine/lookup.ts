import { z } from "zod";
import { Classification, Identity, Maker, MatchRow, ProfileRecord, RetailerListing, Source, Spec, Confidence } from "../schema";
import { recordId, type Library } from "../library";
import { runAgent, type MessagesClient } from "./agent";
import { addCosts, type CostLine } from "./costs";
import { IDENTIFY, PRICE, READ_LISTING, REFRESH, SYSTEM } from "./prompts";
import { resolveLink, cleanUrl, type BrowserAdapter } from "./resolve";

export const MODELS = {
  /** Judgment-heavy steps: identity, classification, retailer search. */
  research: "claude-sonnet-5-5",
  /** Reading known pages: listing extraction and price refresh. */
  reader: "claude-haiku-5-5",
} as const;

export const ListingFacts = z.object({
  retailer: z.string(),
  listingName: z.string(),
  url: z.string(),
  brand: z.string().nullable().describe("Brand or maker named on the listing, else null"),
  displayedPrice: z.number().positive().nullable(),
  promoText: z.string().nullable().describe("Promo wording near the price or in a site banner, quoted"),
  exclusionsText: z.string().nullable().describe("Fine print that blocks discounts, quoted"),
  modelNumber: z.string().nullable(),
  upc: z.string().nullable(),
  specs: z.array(Spec),
  description: z.string(),
  photoUrl: z.string().nullable(),
});
export type ListingFacts = z.infer<typeof ListingFacts>;

export const IdentifyResult = z.object({
  identity: Identity,
  classification: Classification,
  specs: z.array(Spec).min(1),
  match: z.object({ confidence: Confidence, basis: z.string(), rows: z.array(MatchRow) }).nullable(),
  quality: z.array(z.string()).min(1).max(3),
  names: z.array(z.object({ source: z.string(), name: z.string(), likely: z.boolean() })),
  maker: Maker,
  sources: z.array(Source),
});
export type IdentifyResult = z.infer<typeof IdentifyResult>;

export const PriceResult = z.object({ retailers: z.array(RetailerListing).min(1) });

export type Deps = {
  client: MessagesClient;
  library: Library;
  browser?: BrowserAdapter;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  onProgress?: (message: string) => void;
};

export type LookupResult = {
  record: ProfileRecord;
  fromLibrary: boolean;
  costs: CostLine[];
  total: ReturnType<typeof addCosts>;
};

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Full lookup: resolve, read, check library, identify, price, save. */
export async function lookup(url: string, deps: Deps): Promise<LookupResult> {
  const say = deps.onProgress ?? (() => {});
  const now = (deps.now ?? (() => new Date()))();
  const costs: CostLine[] = [];

  say("Following link…");
  const resolved = await resolveLink(url, deps.browser, deps.fetchImpl);

  const byUrl = await deps.library.findByUrl(resolved.finalUrl);
  if (byUrl) {
    say(`Already profiled: ${byUrl.identity.canonicalName}. Refreshing prices…`);
    return refresh(byUrl, deps, { url, resolvedUrl: resolved.finalUrl });
  }

  say("Reading the listing…");
  const read = await runAgent({
    client: deps.client,
    step: "read-listing",
    model: MODELS.reader,
    system: SYSTEM,
    prompt: READ_LISTING(resolved.finalUrl),
    result: ListingFacts,
    resultDescription: "The facts stated on the listing.",
    maxFetches: 3,
    maxSearches: 2,
    onProgress: say,
  });
  costs.push(read.cost);
  const facts = read.value;

  if (facts.modelNumber && facts.brand) {
    const known = await deps.library.findByModel(facts.brand, facts.modelNumber);
    if (known) {
      say(`Matches ${known.identity.canonicalName} in the library. Refreshing prices…`);
      const r = await refresh(known, deps, { url, resolvedUrl: resolved.finalUrl });
      return { ...r, costs: [...costs, ...r.costs], total: addCosts([...costs, ...r.costs]) };
    }
  }

  say("Finding the original product…");
  const ident = await runAgent({
    client: deps.client,
    step: "identify",
    model: MODELS.research,
    system: SYSTEM,
    prompt: IDENTIFY(json(facts)),
    result: IdentifyResult,
    resultDescription: "Identity, classification, match evidence, maker profile and sources.",
    maxSearches: 10,
    maxFetches: 8,
    onProgress: say,
  });
  costs.push(ident.cost);

  // A different listing may resolve to a product we already have.
  if (ident.value.identity.modelNumber) {
    const known = await deps.library.findByModel(ident.value.identity.maker, ident.value.identity.modelNumber);
    if (known) {
      say(`Same product as ${known.identity.canonicalName}. Refreshing prices…`);
      const r = await refresh(known, deps, { url, resolvedUrl: resolved.finalUrl, listingName: facts.listingName, retailer: facts.retailer });
      return { ...r, costs: [...costs, ...r.costs], total: addCosts([...costs, ...r.costs]) };
    }
  }

  say("Checking retailers and prices…");
  const priced = await runAgent({
    client: deps.client,
    step: "price",
    model: MODELS.research,
    system: SYSTEM,
    prompt: PRICE(json({ ...ident.value.identity, specs: ident.value.specs }), resolved.finalUrl, now.toISOString()),
    result: PriceResult,
    resultDescription: "Every retailer listing found, with raw price facts.",
    maxSearches: 6,
    maxFetches: 10,
    onProgress: say,
  });
  costs.push(priced.cost);

  const record = ProfileRecord.parse({
    id: recordId(ident.value.identity.maker, ident.value.identity.modelNumber, ident.value.identity.canonicalName),
    version: 1,
    createdAt: now.toISOString(),
    checkedAt: now.toISOString(),
    input: { url, resolvedUrl: resolved.finalUrl, retailer: facts.retailer, listingName: facts.listingName },
    ...ident.value,
    retailers: priced.value.retailers.map((r) => ({ ...r, url: cleanUrl(r.url) })),
    photo: facts.photoUrl ? { url: facts.photoUrl, credit: facts.retailer, sourceUrl: resolved.finalUrl } : null,
  } satisfies ProfileRecord);

  await deps.library.save(record);
  say("Done.");
  return { record, fromLibrary: false, costs, total: addCosts(costs) };
}

/** Re-check prices on a known product; optionally add a newly pasted listing for it. */
export async function refresh(
  record: ProfileRecord,
  deps: Deps,
  pasted?: { url: string; resolvedUrl: string; listingName?: string; retailer?: string },
): Promise<LookupResult> {
  const now = (deps.now ?? (() => new Date()))();
  const listings = record.retailers.map((r) => ({ ...r, isInputLink: pasted ? false : r.isInputLink }));
  const extra = pasted && !listings.some((l) => cleanUrl(l.url) === cleanUrl(pasted.resolvedUrl));
  const toCheck = extra
    ? [...listings, { retailer: pasted!.retailer ?? "Unknown", label: "Your link", url: pasted!.resolvedUrl, kind: "retail", isInputLink: true, note: "Newly pasted; fill in every field." }]
    : listings.map((l) => (pasted && cleanUrl(l.url) === cleanUrl(pasted.resolvedUrl) ? { ...l, isInputLink: true } : l));

  const run = await runAgent({
    client: deps.client,
    step: "refresh",
    model: MODELS.reader,
    system: SYSTEM,
    prompt: REFRESH(json(toCheck), now.toISOString()),
    result: PriceResult,
    resultDescription: "The same listings with current price facts.",
    maxFetches: toCheck.length + 2,
    onProgress: deps.onProgress,
  });

  const updated = ProfileRecord.parse({
    ...record,
    checkedAt: now.toISOString(),
    input: pasted
      ? { url: pasted.url, resolvedUrl: pasted.resolvedUrl, retailer: pasted.retailer ?? record.input.retailer, listingName: pasted.listingName ?? record.input.listingName }
      : record.input,
    retailers: run.value.retailers,
  });
  await deps.library.save(updated);
  return { record: updated, fromLibrary: true, costs: [run.cost], total: addCosts([run.cost]) };
}
