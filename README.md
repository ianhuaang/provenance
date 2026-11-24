# Provenance (working name)

Paste a furniture or lighting link, get the real product: what it actually is, who designed and made it, where else it's sold, and the lowest price you can really get.

This is **phase 1: the lookup engine**. It runs from the command line, saves each profile to a local library, and renders a profile page. The website, accounts and saved items come in phases 2 and 3 (see the plan doc).

## Setup

1. Install Node 22 or later.
2. `npm install`
3. Create an API key at [console.anthropic.com](https://console.anthropic.com) (Settings > API keys) with billing set up.
4. Copy `.env.example` to `.env` and paste the key there. Never commit `.env` or share the key in chat. The CLI reads `.env` automatically.

## Website

`npm run dev` starts the site at http://localhost:3000: a paste box, live progress, and the profile page. `npm run build` checks it the way Vercel will.

Deploy on Vercel: import this repo at vercel.com/new, then add two environment variables before the first deploy:

- `ANTHROPIC_API_KEY`: your Claude API key.
- `SITE_ACCESS_CODE`: any word you choose. Only people with it can run new lookups, so strangers can't spend your API budget. Example profiles are open to everyone.

Lookups can take up to 3 minutes; the API route allows 300 seconds. Profiles are kept in memory for now and reset when the server restarts; a database comes next.

## Use from the command line

```bash
npm run lookup -- "https://www.urbanoutfitters.com/shop/otto-floor-lamp"
# Prints progress, the verdict, cost per step, and the path to the rendered page in out/

npm run refresh -- adesso-3932-12        # re-check prices for a saved profile
npm run render -- fixtures/otto.json     # render a record without calling the API
npm test                                 # 26 tests, no API key needed
```

A new item costs roughly $0.65 to $1.25 and takes 1 to 3 minutes. A link to a product already in `library/` only refreshes prices, for a few cents. The CLI prints the real cost of every run; record them in `docs/test-links.md`.

## How it works

| Step | File | Model |
| --- | --- | --- |
| Follow redirects, strip affiliate tracking | `src/engine/resolve.ts` | none |
| Read the pasted listing | `src/engine/lookup.ts` (`read-listing`) | Haiku 5.5, web fetch |
| Library check by URL and model number | `src/library.ts` | none |
| Identify, classify, match evidence, maker profile | `lookup.ts` (`identify`) | Sonnet 5.5, web search + fetch |
| Find retailers and raw price facts | `lookup.ts` (`price`) | Sonnet 5.5, web search + fetch |
| Price refresh for known items | `lookup.ts` (`refresh`) | Haiku 5.5, web fetch |
| "You pay", cheapest, staleness | `src/pricing.ts` | none (deterministic) |
| Profile page | `src/render.ts` | none |

The model never computes discounted prices. It reports displayed price, promo, exclusions and shipping; `pricing.ts` applies the rules:

- Exclusions ("Price as Marked. Discounts Do Not Apply.", "not eligible for coupons") beat promos.
- Free memberships and codes count; paid memberships and store cards are shown but not counted.
- Only confirmed matches with prices read on the product page can be named cheapest. Snippet prices, likely matches, search links and resale are shown but labelled.
- Prices older than 24 hours are flagged and re-checked.

All research output is validated against `src/schema.ts` (zod). Invalid output is sent back to the model with the errors.

## Known gaps in phase 1

- **Blocked pages and photos.** Affiliate links and some retailers block plain fetching. `resolve.ts` has a `BrowserAdapter` interface for Browserbase; wiring it in is the first task once you have an account. Product photos also need the browser.
- **Shopping search.** SerpApi Google Shopping is not wired in yet; retailer discovery uses Claude's web search.
- **Library is local JSON files.** Phase 2 moves it to Postgres (Supabase) behind the same `Library` interface.

## Phase 1 gate

Run the engine on 20 real links (`docs/test-links.md`) and check each profile by hand: right product, right maker, right tier, real prices. Fix the misses before building the site.
