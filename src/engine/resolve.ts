/**
 * Step 1a: follow redirects (affiliate links like go.shopmy.us) to the real product page.
 * A plain HTTP fetch handles most redirects. Pages that need JavaScript or block bots
 * go through a BrowserAdapter (Browserbase in production; not wired in phase 1).
 */

export type Resolved = { url: string; finalUrl: string; via: "fetch" | "browser" | "unchanged"; note?: string };

export interface BrowserAdapter {
  /** Open a URL in a real browser and return where it landed. */
  resolve(url: string): Promise<{ finalUrl: string }>;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const TRACKING_PARAMS = /^(utm_|ranMID$|ranEAID$|ranSiteID$|irclickid$|irgwc$|clickid$|affid$|aff_|ref$|ref_$|gclid$|fbclid$|mc_)/i;

/** Strip affiliate and analytics parameters so the stored link is clean. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

export async function resolveLink(url: string, browser?: BrowserAdapter, fetchImpl: typeof fetch = fetch): Promise<Resolved> {
  try {
    const res = await fetchImpl(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(15000) });
    if (res.ok && res.url) return { url, finalUrl: cleanUrl(res.url), via: res.url === url ? "unchanged" : "fetch" };
    if (!browser) return { url, finalUrl: cleanUrl(res.url || url), via: "unchanged", note: `HTTP ${res.status}` };
  } catch (e) {
    if (!browser) return { url, finalUrl: cleanUrl(url), via: "unchanged", note: (e as Error).message };
  }
  const { finalUrl } = await browser!.resolve(url);
  return { url, finalUrl: cleanUrl(finalUrl), via: "browser" };
}
