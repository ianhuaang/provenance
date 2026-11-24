/**
 * Builds the personal Provenance Library artifact into out/library/:
 *   index.html   library and collections (collections persist via the artifact db)
 *   catalog.json one entry per profile, read by index.html
 *   p/<id>.html  each full profile page
 * To add a profile: put its record in fixtures/, add it to src/examples.ts, rebuild, republish.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { EXAMPLES } from "../src/examples";
import { renderProfile } from "../src/render";
import { summarizePrices } from "../src/pricing";

const OUT = "out/library";
mkdirSync(`${OUT}/p`, { recursive: true });
mkdirSync(`${OUT}/img`, { recursive: true });

// Product photos live in photos/<id>.jpg (captured from the listing; kept out of git).
const photoFor = (id: string) => (existsSync(`photos/${id}.jpg`) ? `photos/${id}.jpg` : null);

const catalog = EXAMPLES.map((base) => {
  const photo = photoFor(base.id);
  if (photo) copyFileSync(photo, `${OUT}/img/${base.id}.jpg`);
  const r = photo
    ? { ...base, photo: { url: `../img/${base.id}.jpg`, credit: `${base.input.retailer} product photo`, sourceUrl: base.input.resolvedUrl } }
    : base;
  const s = summarizePrices(r);
  const bar = `<div style="position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px max(5vw,16px);background:#3a2a1c;color:#f6eee4;font:600 14px Inter,system-ui,sans-serif"><a href="../index.html" style="color:#f6eee4;text-decoration:none">← Library</a><span style="font-weight:400;color:#d8c6b2">Prices checked ${new Date(r.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>`;
  writeFileSync(`${OUT}/p/${r.id}.html`, renderProfile(r).replace("<body>", "<body>" + bar));
  return {
    id: r.id,
    name: r.classification.tier === "generic" ? `${r.input.listingName} (generic design)` : r.identity.canonicalName,
    listed: `${r.input.listingName} at ${r.input.retailer}`,
    maker: r.identity.maker,
    tier: r.classification.tier,
    verdict: r.classification.verdict,
    best: s.best && s.best.youPay !== null ? { price: s.best.youPay, retailer: s.best.retailer, url: s.best.url } : null,
    checkedAt: r.checkedAt,
    photo: photo ? `img/${r.id}.jpg` : null,
  };
});
writeFileSync(`${OUT}/catalog.json`, JSON.stringify(catalog, null, 2));
copyFileSync("scripts/library.html", `${OUT}/index.html`);
console.log(`Library written to ${OUT}/ with ${catalog.length} profiles`);
