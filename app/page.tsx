import { EXAMPLES } from "../src/examples";
import { summarizePrices, formatUsd } from "../src/pricing";
import Lookup from "./lookup";

export default function Home() {
  const examples = EXAMPLES.map((r) => {
    const best = summarizePrices(r).best;
    return {
      id: r.id,
      listed: `${r.input.listingName} at ${r.input.retailer}`,
      name: r.classification.tier === "generic" ? "Generic, sold under many names" : r.identity.canonicalName,
      verdict: r.classification.verdict,
      best: best ? `Cheapest: ${formatUsd(best.youPay)} at ${best.retailer}` : "No verified price yet",
    };
  });

  return (
    <main>
      <Lookup />
      <section className="band examples">
        <div className="wrap">
          <h2>Examples</h2>
          <p>Four listings, checked by hand. Each one turned out to be something other than its name suggests.</p>
          <div className="grid">
            {examples.map((e) => (
              <a key={e.id} className="card" href={`/examples/${e.id}`}>
                <small>{e.listed}</small>
                <h3>{e.name}</h3>
                <span className="v">{e.verdict}</span>
                <p>{e.best}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="band" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="how">
            <div><b>Find the real product</b>Follows the link, reads the listing, and matches it to the maker's model number, even when a retailer renames it.</div>
            <div><b>Say what it is</b>Designer piece, brand-designed, generic factory item, or replica, with the evidence.</div>
            <div><b>Price it honestly</b>What each store shows, what you'd actually pay after promos, and the fine print.</div>
            <div><b>Profile the maker</b>Who designed and made it, and how they sell.</div>
          </div>
        </div>
      </section>
      <footer>Prices change often; every profile shows when it was checked. Not affiliated with any retailer.</footer>
    </main>
  );
}
