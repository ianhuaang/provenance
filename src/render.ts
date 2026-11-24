import type { ProfileRecord, Tier } from "./schema";
import { formatUsd, isStale, summarizePrices, type PricedListing } from "./pricing";

/** Renders any profile record as one self-contained HTML page in the Levi/Otto house style. */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TIERS: { tier: Tier; name: string; blurb: string }[] = [
  { tier: "designer", name: "Designer piece", blurb: "Named designer, licensed maker, documented history" },
  { tier: "brand-designed", name: "Brand-designed", blurb: "Original product from a brand's in-house team" },
  { tier: "generic", name: "Generic / white-label", blurb: "Factory item sold under many unrelated labels" },
  { tier: "replica", name: "Replica", blurb: "Copy of a designer piece; excluded from results" },
];

const REQUIRES: Record<string, string> = {
  none: "",
  "free-membership": "free membership",
  "paid-membership": "paid membership, not counted",
  code: "promo code",
  "credit-card": "store card, not counted",
  "minimum-spend": "minimum spend",
};

const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function conditions(r: PricedListing): string {
  const parts: string[] = [];
  if (r.promo) {
    const req = REQUIRES[r.promo.requires] ? ` (${REQUIRES[r.promo.requires]})` : "";
    const code = r.promo.code ? `, code ${esc(r.promo.code)}` : "";
    if (r.promoBlockedBy) parts.push(`<b>Promo doesn't apply:</b> ${esc(r.promo.description)} is blocked by "${esc(r.promoBlockedBy)}"`);
    else parts.push(`<b>${esc(r.promo.description)}</b>${esc(req)}${code}`);
  } else if (r.exclusions) parts.push(`Fine print: "${esc(r.exclusions)}"`);
  if (r.notes) parts.push(esc(r.notes));
  if (r.ineligibleReason && r.youPay !== null) parts.push(`<i>${esc(r.ineligibleReason)}.</i>`);
  return parts.join(" ");
}

function flags(r: PricedListing): string {
  const f: string[] = [];
  if (r.confidence === "likely") f.push("Likely match");
  if (r.priceSource !== "product-page") f.push("Unverified price");
  if (r.kind === "resale") f.push("Resale");
  if (r.available === false) f.push("Sold out");
  if (r.isInputLink) f.push("Your link");
  return f.map((x) => `<span class="flag">${esc(x)}</span>`).join("");
}

export type RenderOptions = {
  /** Prefix for relative asset paths such as "img/<id>.jpg" (e.g. "../" for pages in p/). Relative photos are skipped without it. */
  assetBase?: string;
};

export function renderProfile(rec: ProfileRecord, now: Date = new Date(), opts: RenderOptions = {}): string {
  const photoUrl = rec.photo
    ? /^(https:|data:)/.test(rec.photo.url)
      ? rec.photo.url
      : opts.assetBase !== undefined
        ? opts.assetBase + rec.photo.url
        : null
    : null;
  const s = summarizePrices(rec);
  const id = rec.identity;
  const cls = rec.classification;
  const renamed = cls.renamedByRetailer;
  const generic = cls.tier === "generic";
  const nameCount = rec.names.length;
  const title = generic
    ? `${rec.input.listingName} is a generic design`
    : renamed
      ? `${rec.input.listingName} is the ${id.shortName}`
      : id.canonicalName;
  const sub = generic
    ? `Sold under at least ${nameCount} names · No maker or model number found`
    : renamed
    ? `${esc(possessive(rec.input.retailer))} name for ${esc(id.canonicalName)}${id.modelNumber ? ` · Model <b>${esc(id.modelNumber)}</b>` : ""}`
    : `${id.modelNumber ? `Model <b>${esc(id.modelNumber)}</b>` : "No model number found"}${id.listPrice ? ` · List price <b>${formatUsd(id.listPrice)}</b>` : ""}`;
  const max = Math.max(...s.rows.map((r) => Math.max(r.displayedPrice ?? 0, r.youPay ?? 0)), 1) * 1.08;

  const card: [string, string][] = [
    ["Canonical name", id.canonicalName],
    ["Model number", [id.modelNumber ?? "Not found", ...id.otherModelNumbers.map((o) => `${o.model} (${o.note})`)].join("; ")],
    ["Maker", [id.maker, id.makerLocation].filter(Boolean).join(", ")],
    ["Designer", cls.designer.name ? `${cls.designer.name}${cls.designer.note ? `. ${cls.designer.note}` : ""}` : cls.designer.note],
    ...rec.specs.map((x) => [x.label, x.value] as [string, string]),
  ];

  const best = s.best;
  const bestLine = best
    ? `<div class="best"><div class="big">${formatUsd(best.youPay)}${best.promoApplied ? `<s>${formatUsd(best.displayedPrice)}</s>` : ""}</div><p><b>Cheapest right now: ${esc(best.retailer)}${
        best.promoApplied && best.promo ? `, ${esc(REQUIRES[best.promo.requires] ? "with a " + REQUIRES[best.promo.requires] : "with its current promo")}` : ""
      }.</b> ${best.promoApplied && best.promo ? esc(best.promo.description) + ". " : ""}${
        s.runnerUp && s.runnerUp.youPay !== null && best.youPay !== null
          ? `About ${formatUsd(Math.round(s.runnerUp.youPay - best.youPay))} below ${esc(s.runnerUp.retailer)}. `
          : ""
      }${(() => {
        const lead = s.rows.find((r) => r.youPay !== null && best.youPay !== null && r.youPay < best.youPay && r.available !== false && r.kind !== "resale");
        return lead ? `${esc(lead.retailer)} lists it for ${formatUsd(lead.youPay)}, but that price or match isn't confirmed yet. ` : "";
      })()}${
        s.inputRow && s.inputRow.retailer !== best.retailer
          ? s.inputRow.available === false
            ? `The store you found it at, ${esc(s.inputRow.retailer)}, shows it sold out.`
            : s.inputRow.youPay !== null
              ? `Your link costs ${formatUsd(s.inputRow.youPay)} at ${esc(s.inputRow.retailer)}.`
              : ""
          : ""
      }</p></div>`
    : `<div class="best"><p><b>No verified price yet.</b> Prices below come from search results and need checking on the retailer's page.</p></div>`;

  const rows = s.rows
    .map(
      (r) => `<div class="row">
  <div class="who"><b>${esc(r.retailer)}</b>${flags(r)}<span>${esc(r.label)}</span></div>
  <div class="track">${r.displayedPrice && r.youPay !== null && r.displayedPrice > r.youPay ? `<div class="shown" style="width:${((r.displayedPrice / max) * 100).toFixed(1)}%"></div>` : ""}${
        r.youPay !== null ? `<div class="pay${r === best ? " lo" : ""}${r.eligibleForBest ? "" : " dim"}" style="width:${((r.youPay / max) * 100).toFixed(1)}%"></div>` : ""
      }</div>
  <div class="num dim">${r.promoApplied ? `<s>${formatUsd(r.displayedPrice)}</s>` : formatUsd(r.displayedPrice)}</div>
  <div class="num you">${formatUsd(r.youPay)}</div>
  <a class="go${r.isSearchLink ? " alt" : ""}" href="${esc(r.url)}" rel="noopener nofollow">${r.isSearchLink ? "Search" : "View"} <span aria-hidden="true">→</span></a>
  <div class="cond">${conditions(r)}</div>
</div>`,
    )
    .join("");

  const stale = isStale(rec.checkedAt, now);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id.shortName)} Profile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light dark;--bg:light-dark(#fff,#141210);--ink:light-dark(#16130f,#f1ece6);--mute:light-dark(#6a6259,#a99f94);--rule:light-dark(#e7e1d9,#38312b);--panel:light-dark(#f8f4ee,#1d1915);--wood:light-dark(#dcbc8e,#cfae80);--wood2:light-dark(#b38a58,#a07b4c);--walnut:light-dark(#3a2a1c,#2a1e14);--walnut-ink:#f6eee4;--accent:light-dark(#2346d6,#7d97ff);--good:light-dark(#0f7a4a,#4cc98d)}
:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box;min-width:0}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif;overflow-x:clip}
h1,h2,h3{font-family:Archivo,Inter,sans-serif;font-weight:600;letter-spacing:-.02em;line-height:1.05;margin:0;text-wrap:balance}
h1{font-size:clamp(32px,5vw,50px)}h2{font-size:clamp(24px,3vw,32px);margin-bottom:8px}h3{font-size:18px;margin-bottom:4px}
p{margin:0 0 12px;max-width:70ch}a{color:var(--accent)}
.wrap{max-width:1240px;margin:0 auto}
.band{padding-block:clamp(28px,4vw,56px);padding-left:max(5vw,16px);padding-right:max(5vw,16px)}
.top{border-bottom:1px solid var(--rule)}
.head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px 32px;align-items:end;margin-bottom:28px}
.sub{color:var(--mute);margin-top:10px}.sub b{color:var(--ink);font-weight:600;white-space:nowrap}
.verdict{background:var(--walnut);color:var(--walnut-ink);padding:14px 18px;border-radius:6px;max-width:360px}
.verdict small{display:block;font-size:13px;opacity:.78}.verdict strong{font-family:Archivo,sans-serif;font-size:22px;font-weight:600}
.hero{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:28px;align-items:start}
.photo{background:var(--panel);border-radius:8px;min-height:360px;display:grid;place-items:center;overflow:hidden}
.photo img{display:block;width:100%;height:100%;max-height:620px;object-fit:contain}
.tag{padding:32px;text-align:left;width:100%}
.tag .mk{color:var(--mute)}.tag .model{font-family:Archivo,sans-serif;font-size:clamp(40px,6vw,64px);font-weight:600;letter-spacing:-.03em;line-height:1;margin:10px 0 16px;overflow-wrap:anywhere}
.tag small{display:block;color:var(--mute);font-size:13px;margin-top:18px}
.side{display:grid;gap:20px}
.card{border:1px solid var(--rule);border-radius:8px;padding:4px 18px}.card dl{margin:0}
.card div{display:grid;grid-template-columns:8.5em minmax(0,1fr);gap:12px;padding:9px 0;border-bottom:1px solid var(--rule)}.card div:last-child{border-bottom:0}
.card dt{color:var(--mute);font-size:14px}.card dd{margin:0;font-weight:500}
.likely{font-size:14px;color:var(--mute);margin:10px 2px 0}
table{border-collapse:collapse;width:100%}
.ok{color:var(--good);font-weight:600}.no{color:var(--mute)}
.scale{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:22px 0 10px}
.step{padding:14px 14px 16px;border-radius:6px;background:var(--panel);border:1px solid var(--rule);position:relative}
.step h3{font-size:16px}.step p{font-size:14px;color:var(--mute);margin:0}
.step.on{background:var(--wood);border-color:var(--wood);color:#1c140b}.step.on p{color:#3b2c1c}
.step.on::after{content:"This item";position:absolute;top:-11px;right:12px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;padding:1px 9px;border-radius:20px}
.best{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 24px;align-items:center;background:var(--panel);border:1px solid var(--rule);border-left:4px solid var(--accent);border-radius:6px;padding:16px 20px;margin:18px 0 8px}
.best .big{font-family:Archivo,sans-serif;font-size:clamp(34px,5vw,48px);font-weight:600;letter-spacing:-.02em;white-space:nowrap;line-height:1}
.best .big s{font-size:.45em;color:var(--mute);font-weight:500;margin-left:6px}.best p{margin:0}
.row{display:grid;grid-template-columns:minmax(10em,13em) minmax(0,1fr) 6em 6em 6.5em;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--rule)}
.rowhead{font-size:13px;color:var(--mute);padding:8px 0;border-bottom:1px solid var(--ink)}.rowhead span:nth-child(3),.rowhead span:nth-child(4){text-align:right}
.who b{display:inline}.who span{display:block;font-size:13px;color:var(--mute)}
.who .flag{display:inline-block;font-size:12px;font-weight:600;padding:0 7px;border-radius:10px;background:var(--panel);border:1px solid var(--rule);color:var(--mute);margin-left:6px;vertical-align:1px;white-space:nowrap}
.track{position:relative;height:22px}
.shown{position:absolute;left:0;top:3px;height:16px;border-radius:3px;background:repeating-linear-gradient(135deg,var(--rule) 0 4px,transparent 4px 8px);border:1px solid var(--rule)}
.pay{position:absolute;left:0;top:3px;height:16px;border-radius:3px;background:var(--wood2)}.pay.lo{background:var(--accent)}.pay.dim{opacity:.45}
.cond{grid-column:2/-2;font-size:13px;color:var(--mute);margin-top:-4px}.cond b{color:var(--ink);font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.num.dim{color:var(--mute)}.num.you{font-weight:600}
.go{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 14px;border-radius:6px;background:var(--ink);color:var(--bg);font-weight:600;font-size:15px;text-decoration:none;white-space:nowrap}
.go:hover{background:var(--accent);color:#fff}.go:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.go.alt{background:transparent;color:var(--ink);border:1.5px solid var(--ink)}
.checked{font-size:14px;color:var(--mute);margin-top:16px}.checked.stale{color:var(--ink);font-weight:600}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px}
.names{list-style:none;padding:0;margin:14px 0 0}.names li{display:grid;grid-template-columns:8.5em minmax(0,1fr);gap:12px;padding:9px 0;border-bottom:1px solid var(--rule)}.names li span:first-child{color:var(--mute);font-size:14px}
.maker{background:var(--walnut);color:var(--walnut-ink)}.maker .mute{color:#d2c1ae}
.tl{display:grid;grid-template-columns:repeat(auto-fit,minmax(9em,1fr));margin:22px 0 10px;border-top:2px solid #cdb9a6}
.tl div{padding:12px 14px 0 0;position:relative}.tl div::before{content:"";position:absolute;top:-7px;left:0;width:12px;height:12px;border-radius:50%;background:var(--wood)}
.tl b{font-family:Archivo,sans-serif;font-size:22px;display:block}.tl span{font-size:14px;color:#e4d3c2}
.src{font-size:14px;color:var(--mute)}.src li{margin-bottom:4px}.src a{overflow-wrap:anywhere}
@media(max-width:900px){.hero,.two{grid-template-columns:minmax(0,1fr)}.scale{grid-template-columns:repeat(2,minmax(0,1fr))}.photo{min-height:240px}}
@media(max-width:700px){.row{grid-template-columns:minmax(0,1fr) auto auto}.rowhead{display:none}.row .track{grid-column:1/-1;order:5}.row .num.dim{display:none}.cond{grid-column:1/-1;order:6;margin-top:0}}
@media(max-width:600px){.head{grid-template-columns:minmax(0,1fr)}.verdict{max-width:none}.card div,.names li{grid-template-columns:7em minmax(0,1fr)}.best{grid-template-columns:minmax(0,1fr)}}
@media(max-width:420px){.scale{grid-template-columns:minmax(0,1fr)}}
</style>
</head>
<body>
<section class="band top"><div class="wrap">
  <div class="head">
    <div><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>
    <div class="verdict"><small>Verdict</small><strong>${esc(cls.verdict)}</strong><small>${esc(cls.verdictNote)}</small></div>
  </div>
  <div class="hero">
    <div class="photo">${
      photoUrl
        ? `<img src="${esc(photoUrl)}" alt="${esc(id.canonicalName)}">`
        : generic
          ? `<div class="tag"><div class="mk">One lamp, many listings</div><div class="model">${nameCount} names</div><div>${esc(rec.names.map((n) => n.name).slice(0, 4).join(" · "))}${nameCount > 4 ? " …" : ""}</div><small>Photo pending</small></div>`
          : `<div class="tag"><div class="mk">${esc(id.maker)}</div><div class="model">${esc(id.modelNumber ?? id.shortName)}</div><div>${esc(id.canonicalName)}</div><small>Photo pending</small></div>`
    }</div>
    <div class="side">
      <div class="card"><dl>${card.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>
      ${
        rec.match && rec.match.confidence === "likely"
          ? `<p class="likely">Likely the same product, not yet confirmed: ${esc(rec.match.basis)}.</p>`
          : ""
      }
    </div>
  </div>
</div></section>

<section class="band"><div class="wrap">
  <h2>Where it sits on the provenance scale</h2>
  <p>${esc(cls.summary)}${cls.originalIfReplica ? ` Original: ${esc(cls.originalIfReplica)}.` : ""}</p>
  <div class="scale">${TIERS.map((t) => `<div class="step${t.tier === cls.tier ? " on" : ""}"><h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p></div>`).join("")}</div>
</div></section>

<section class="band" style="padding-top:0"><div class="wrap">
  <h2>Where to buy it today</h2>
  ${bestLine}
  <div class="row rowhead"><span>Retailer</span><span></span><span>Displayed</span><span>You pay</span><span></span></div>
  ${rows}
  <p class="checked${stale ? " stale" : ""}">Prices checked ${esc(day(rec.checkedAt))}${stale ? ". These prices are more than a day old and will be re-checked." : "."} "You pay" includes promos anyone can get for free and known shipping; paid memberships and store cards are listed but not counted.</p>
</div></section>

<section class="band" style="padding-top:0"><div class="wrap two">
  <div><h2>Names it goes by</h2><p>${
    id.modelNumber
      ? `Search for the model number ${esc(id.modelNumber)}, not the name. Retailers rename products freely.`
      : "There's no model number, so listings are matched on exact size, specs and photos. Names marked likely haven't been checked spec by spec."
  }</p>
  <ul class="names">${rec.names.map((n) => `<li><span>${esc(n.source)}</span><span>${esc(n.name)}${n.likely ? " (likely)" : ""}</span></li>`).join("")}</ul></div>
  <div><h2>What you're paying for</h2>${rec.quality.map((q) => `<p>${esc(q)}</p>`).join("")}</div>
</div></section>

<section class="band maker"><div class="wrap">
  <h2>Maker profile: ${esc(rec.maker.name)}</h2>
  ${rec.maker.paragraphs.map((p, i) => `<p${i ? ' class="mute"' : ""}>${esc(p)}</p>`).join("")}
  ${rec.maker.timeline.length ? `<div class="tl">${rec.maker.timeline.map((t) => `<div><b>${esc(t.when)}</b><span>${esc(t.what)}</span></div>`).join("")}</div>` : ""}
</div></section>

<section class="band"><div class="wrap src">
  <h3>Sources</h3>
  <ul>${rec.sources.map((x) => `<li><a href="${esc(x.url)}" rel="noopener nofollow">${esc(x.title)}</a></li>`).join("")}</ul>
  ${photoUrl && rec.photo ? `<p>Photo: ${esc(rec.photo.credit)}, <a href="${esc(rec.photo.sourceUrl)}">source</a>.</p>` : ""}
</div></section>
</body>
</html>
`;
}
