/**
 * Builds the personal Provenance Library artifact into out/library/:
 *   index.html   library and collections (collections persist via the artifact db)
 *   catalog.json one entry per profile, read by index.html
 *   p/<id>.html  each full profile page
 * Every fixtures/*.json record is included, newest first. To add a profile, add its JSON file and rebuild.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { ProfileRecord } from "../src/schema";
import { renderProfile } from "../src/render";
import { summarizePrices } from "../src/pricing";

const OUT = "out/library";
mkdirSync(`${OUT}/p`, { recursive: true });
mkdirSync(`${OUT}/img`, { recursive: true });

// Photos: a record's photo.url is "img/<id>.jpg" inside the library artifact. Files captured in this
// session sit in photos/<id>.jpg (kept out of git) and are copied in; earlier ones are already in the artifact.
const copyPhoto = (id: string) => existsSync(`photos/${id}.jpg`) && (copyFileSync(`photos/${id}.jpg`, `${OUT}/img/${id}.jpg`), true);

const records = readdirSync("fixtures")
  .filter((f) => f.endsWith(".json"))
  .map((f) => ProfileRecord.parse(JSON.parse(readFileSync(`fixtures/${f}`, "utf8"))))
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const catalog = records.map((r) => {
  copyPhoto(r.id);
  const s = summarizePrices(r);
  const bar = `<div style="position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px max(5vw,16px);background:#3a2a1c;color:#f6eee4;font:600 14px Inter,system-ui,sans-serif"><a href="../index.html" style="color:#f6eee4;text-decoration:none">← Library</a><span style="font-weight:400;color:#d8c6b2">Prices checked ${new Date(r.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>`;
  writeFileSync(`${OUT}/p/${r.id}.html`, renderProfile(r, new Date(), { assetBase: "../" }).replace("<body>", "<body>" + bar));
  return {
    id: r.id,
    name: r.classification.tier === "generic" ? `${r.input.listingName} (generic design)` : r.identity.canonicalName,
    listed: `${r.input.listingName} at ${r.input.retailer}`,
    maker: r.identity.maker,
    tier: r.classification.tier,
    verdict: r.classification.verdict,
    best: s.best && s.best.youPay !== null ? { price: s.best.youPay, retailer: s.best.retailer, url: s.best.url } : null,
    checkedAt: r.checkedAt,
    photo: r.photo && !/^(https:|data:)/.test(r.photo.url) ? r.photo.url : null,
  };
});
writeFileSync(`${OUT}/catalog.json`, JSON.stringify(catalog, null, 2));
copyFileSync("scripts/library.html", `${OUT}/index.html`);
console.log(`Library written to ${OUT}/ with ${catalog.length} profiles`);
