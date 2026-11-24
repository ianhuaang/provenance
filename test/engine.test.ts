import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runAgent, AgentError, type MessagesClient } from "../src/engine/agent.js";
import { lookup, refresh, IdentifyResult, type ListingFacts } from "../src/engine/lookup.js";
import { cleanUrl, resolveLink } from "../src/engine/resolve.js";
import { FileLibrary } from "../src/library.js";
import { ProfileRecord } from "../src/schema.js";

const usage = (over: Partial<Anthropic.Usage> = {}): Anthropic.Usage =>
  ({ input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 }, ...over }) as Anthropic.Usage;

const msg = (content: unknown[], stop: Anthropic.StopReason, u?: Partial<Anthropic.Usage>): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: usage(u) }) as unknown as Anthropic.Message;

const submit = (input: unknown, id = "t1") => ({ type: "tool_use", id, name: "submit", input });

/** A fake client that replays scripted responses and records the requests. */
function fakeClient(responses: Anthropic.Message[] | ((p: Anthropic.MessageCreateParamsNonStreaming, i: number) => Anthropic.Message)) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(p) {
        calls.push(structuredClone(p));
        const i = calls.length - 1;
        const r = typeof responses === "function" ? responses(p, i) : responses[i];
        if (!r) throw new Error(`no scripted response ${i}`);
        return r;
      },
    },
  };
  return { client, calls };
}

const Answer = z.object({ answer: z.string() });
const base = { step: "t", model: "claude-haiku-5-5" as const, system: "s", prompt: "p", result: Answer, resultDescription: "d" };

describe("runAgent", () => {
  it("returns a valid submission and declares the right tools", async () => {
    const { client, calls } = fakeClient([msg([submit({ answer: "ok" })], "tool_use")]);
    const r = await runAgent({ ...base, client, maxSearches: 3, maxFetches: 2 });
    expect(r.value).toEqual({ answer: "ok" });
    const tools = calls[0]!.tools!.map((t) => ("type" in t && t.type ? t.type : t.name));
    expect(tools).toEqual(["web_search_20250305", "web_fetch_20250910", "submit"]);
  });

  it("continues after pause_turn and adds up usage and search costs", async () => {
    const { client, calls } = fakeClient([
      msg([{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }], "pause_turn", { server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } }),
      msg([submit({ answer: "done" })], "tool_use", { server_tool_use: { web_search_requests: 1, web_fetch_requests: 1 } }),
    ]);
    const progress: string[] = [];
    const r = await runAgent({ ...base, client, maxSearches: 5, onProgress: (m) => progress.push(m) });
    expect(r.turns).toBe(2);
    expect(calls[1]!.messages.at(-1)!.role).toBe("assistant");
    expect(r.cost.webSearches).toBe(3);
    expect(r.cost.webFetches).toBe(1);
    expect(r.cost.usd).toBeCloseTo((2000 * 0.1 + 200 * 0.5) / 1e6 + 0.03, 6);
    expect(progress).toContain("Searching: q");
  });

  it("re-prompts with the validation error when a submission is malformed", async () => {
    const { client, calls } = fakeClient([msg([submit({ answer: 5 })], "tool_use"), msg([submit({ answer: "fixed" }, "t2")], "tool_use")]);
    const r = await runAgent({ ...base, client });
    expect(r.value.answer).toBe("fixed");
    const followUp = calls[1]!.messages.at(-1)!;
    expect(JSON.stringify(followUp)).toMatch(/is_error/);
  });

  it("nudges for a submission when the model just talks", async () => {
    const { client, calls } = fakeClient([msg([{ type: "text", text: "Here's what I found" }], "end_turn"), msg([submit({ answer: "x" })], "tool_use")]);
    await runAgent({ ...base, client });
    expect(JSON.stringify(calls[1]!.messages.at(-1))).toMatch(/submit/);
  });

  it("gives up after maxTurns", async () => {
    const { client } = fakeClient(() => msg([{ type: "text", text: "thinking" }], "end_turn"));
    await expect(runAgent({ ...base, client, maxTurns: 3 })).rejects.toBeInstanceOf(AgentError);
  });
});

describe("resolveLink", () => {
  it("strips affiliate tracking from the landed URL", () => {
    expect(
      cleanUrl(
        "https://www.urbanoutfitters.com/shop/crosley-levi-burl-tone-storage-sideboard?utm_medium=affiliates&utm_source=rakuten&ranMID=43176&ranEAID=x&ranSiteID=y&color=029",
      ),
    ).toBe("https://www.urbanoutfitters.com/shop/crosley-levi-burl-tone-storage-sideboard?color=029");
  });

  it("follows redirects with fetch", async () => {
    const fake = (async () => ({ ok: true, status: 200, url: "https://shop.example/p/1?utm_source=x" })) as unknown as typeof fetch;
    const r = await resolveLink("https://go.example/abc", undefined, fake);
    expect(r).toMatchObject({ finalUrl: "https://shop.example/p/1", via: "fetch" });
  });

  it("falls back to the browser adapter when fetch is blocked", async () => {
    const fake = (async () => ({ ok: false, status: 403, url: "https://go.example/abc" })) as unknown as typeof fetch;
    const r = await resolveLink("https://go.example/abc", { resolve: async () => ({ finalUrl: "https://shop.example/p/2" }) }, fake);
    expect(r).toMatchObject({ finalUrl: "https://shop.example/p/2", via: "browser" });
  });
});

const otto = ProfileRecord.parse(JSON.parse(readFileSync(new URL("../fixtures/otto.json", import.meta.url), "utf8")));
const passthrough = (async (u: string) => ({ ok: true, status: 200, url: u })) as unknown as typeof fetch;

describe("lookup flow", () => {
  it("runs read, identify and price for a new item, then saves it to the library", async () => {
    const lib = new FileLibrary(mkdtempSync(join(tmpdir(), "lib-")));
    const facts: ListingFacts = {
      retailer: "Urban Outfitters", listingName: "Otto Floor Lamp", url: otto.input.resolvedUrl, brand: null, displayedPrice: 449,
      promoText: "+40% Off in Cart for UO Rewards Members", exclusionsText: null, modelNumber: null, upc: null,
      specs: [{ label: "Height", value: "62 in" }], description: "Lamp", photoUrl: null,
    };
    const ident: z.input<typeof IdentifyResult> = {
      identity: otto.identity, classification: otto.classification, specs: otto.specs, match: otto.match,
      quality: otto.quality, names: otto.names, maker: otto.maker, sources: otto.sources,
    };
    const steps: string[] = [];
    const { client, calls } = fakeClient((p) => {
      const step = String(p.messages[0]!.content).slice(0, 20);
      steps.push(step);
      if (step.startsWith("Read this")) return msg([submit(facts)], "tool_use");
      if (step.startsWith("Here are the facts")) return msg([submit(ident)], "tool_use", { server_tool_use: { web_search_requests: 8, web_fetch_requests: 5 } });
      return msg([submit({ retailers: otto.retailers })], "tool_use");
    });
    const r = await lookup(otto.input.resolvedUrl, { client, library: lib, fetchImpl: passthrough, now: () => new Date("2026-11-24T16:05:00Z") });
    expect(calls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5"]);
    expect(r.record.id).toBe("adesso-3932-12");
    expect(r.fromLibrary).toBe(false);
    expect(r.total.webSearches).toBe(8);
    expect(await lib.get("adesso-3932-12")).not.toBeNull();
  });

  it("skips research for a link already in the library and only refreshes prices", async () => {
    const lib = new FileLibrary(mkdtempSync(join(tmpdir(), "lib-")));
    await lib.save(otto);
    const { client, calls } = fakeClient([msg([submit({ retailers: otto.retailers })], "tool_use")]);
    const r = await lookup("https://www.urbanoutfitters.com/shop/otto-floor-lamp", { client, library: lib, fetchImpl: passthrough });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("claude-haiku-5-5");
    expect(calls[0]!.tools!.some((t) => "type" in t && t.type === "web_search_20250305")).toBe(false);
    expect(r.fromLibrary).toBe(true);
  });

  it("adds a newly pasted listing for a known product when refreshing", async () => {
    const { client, calls } = fakeClient([msg([submit({ retailers: otto.retailers })], "tool_use")]);
    const lib = new FileLibrary(mkdtempSync(join(tmpdir(), "lib-")));
    await refresh(otto, { client, library: lib }, { url: "https://x.example/a", resolvedUrl: "https://shop.example/orchard", retailer: "Shop" });
    expect(String(calls[0]!.messages[0]!.content)).toContain("https://shop.example/orchard");
  });
});
