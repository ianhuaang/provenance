import { z } from "zod";
import { lookup, type Deps } from "../engine/lookup";
import { renderProfile } from "../render";
import { summarizePrices, formatUsd } from "../pricing";

export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "done"; id: string; name: string; verdict: string; best: string | null; fromLibrary: boolean; costUsd: number; html: string }
  | { type: "error"; message: string };

export const LookupRequest = z.object({
  url: z.url({ message: "That doesn't look like a link. Paste the full product URL." }),
  code: z.string().optional(),
});

/** Runs a lookup and streams newline-delimited JSON events: progress lines, then done or error. */
export function lookupStream(url: string, deps: Omit<Deps, "onProgress">): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const heartbeat = setInterval(() => controller.enqueue(enc.encode("\n")), 15000);
      try {
        const r = await lookup(url, { ...deps, onProgress: (message) => send({ type: "progress", message }) });
        const best = summarizePrices(r.record).best;
        send({
          type: "done",
          id: r.record.id,
          name: r.record.identity.canonicalName,
          verdict: r.record.classification.verdict,
          best: best ? `${formatUsd(best.youPay)} at ${best.retailer}` : null,
          fromLibrary: r.fromLibrary,
          costUsd: Math.round(r.total.usd * 1000) / 1000,
          html: renderProfile(r.record),
        });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Something went wrong." });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });
}
