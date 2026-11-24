/**
 * Builds a static preview of the website (home page + every example profile) into out/preview/.
 * Used to publish a clickable preview before the live site is deployed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EXAMPLES } from "../src/examples";
import { renderProfile } from "../src/render";
import { summarizePrices, formatUsd } from "../src/pricing";

const OUT = "out/preview";
mkdirSync(`${OUT}/p`, { recursive: true });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const key = (u: string) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};

const known: Record<string, string> = {};
for (const r of EXAMPLES) {
  for (const u of [r.input.url, r.input.resolvedUrl, ...r.retailers.filter((l) => !l.isSearchLink).map((l) => l.url)]) known[key(u)] = r.id;
  const bar = `<div style="position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px max(5vw,16px);background:#3a2a1c;color:#f6eee4;font:600 14px Inter,system-ui,sans-serif"><a href="../index.html" style="color:#f6eee4;text-decoration:none">← Provenance</a><span style="font-weight:400;color:#d8c6b2">Profile checked ${new Date(r.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>`;
  writeFileSync(`${OUT}/p/${r.id}.html`, renderProfile(r).replace("<body>", "<body>" + bar));
}

const cards = EXAMPLES.map((r) => {
  const best = summarizePrices(r).best;
  const name = r.classification.tier === "generic" ? "Generic, sold under many names" : r.identity.canonicalName;
  return `<a class="card" href="p/${r.id}.html"><small>${esc(r.input.listingName)} at ${esc(r.input.retailer)}</small><h3>${esc(name)}</h3><span class="v">${esc(r.classification.verdict)}</span><p>${best ? `Cheapest: ${formatUsd(best.youPay)} at ${esc(best.retailer)}` : "No verified price yet"}</p></a>`;
}).join("");

const css = readFileSync("app/globals.css", "utf8");
writeFileSync(
  `${OUT}/index.html`,
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Provenance Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}
.note{margin-top:16px;padding:12px 14px;border-radius:8px;background:#2a1e14;color:#e2d3c2;font-size:15px;display:none}.note b{color:#fff}
.preview{background:#ffd8a8;color:#1c140b;font-size:14px;text-align:center;padding:8px 16px}</style></head><body>
<div class="preview">Preview of the website. Example profiles are live; new links run once the site is deployed.</div>
<main>
<section class="hero"><div class="wrap">
<div class="brand">Provenance</div>
<h1>Paste a furniture link. See what it really is.</h1>
<p>Who actually made it, whether it's a designer piece or a renamed factory item, and the cheapest place to buy the real thing.</p>
<form class="paste" id="f"><input id="url" type="url" inputmode="url" placeholder="https://www.example.com/products/that-lamp" aria-label="Product link" required><button type="submit">Look it up</button></form>
<div class="note" id="note" role="status"></div>
</div></section>
<section class="band examples"><div class="wrap"><h2>Profiles</h2><p>Checked by hand. Each one turned out to be something other than its name suggests.</p><div class="grid">${cards}</div></div></section>
<section class="band" style="padding-top:0"><div class="wrap"><div class="how">
<div><b>Find the real product</b>Follows the link, reads the listing, and matches it to the maker's model number, even when a retailer renames it.</div>
<div><b>Say what it is</b>Designer piece, brand-designed, generic factory item, or replica, with the evidence.</div>
<div><b>Price it honestly</b>What each store shows, what you'd actually pay after promos, and the fine print.</div>
<div><b>Profile the maker</b>Who designed and made it, and how they sell.</div>
</div></div></section>
<footer>Prices change often; every profile shows when it was checked. Not affiliated with any retailer.</footer>
</main>
<script>
{
const known = ${JSON.stringify(known).replace(/</g, "\\u003c")};
const key = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\\./, "") + x.pathname.replace(/\\/$/, "")).toLowerCase(); } catch { return u.toLowerCase(); } };
const f = document.getElementById("f"), note = document.getElementById("note");
f.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = known[key(document.getElementById("url").value.trim())];
  if (id) { location.href = "p/" + id + ".html"; return; }
  note.style.display = "block";
  note.innerHTML = "<b>Not profiled yet.</b> In this preview, only the links below open. Send this link to Claude in the chat and it will be researched and added here; on the live site it runs automatically in about two minutes.";
});
}
</script></body></html>`,
);
console.log(`Preview written to ${OUT}/ with ${EXAMPLES.length} profiles`);
