import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ProfileRecord } from "../src/schema.js";
import { renderProfile } from "../src/render.js";

const load = (name: string) => ProfileRecord.parse(JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")));
const at = new Date("2026-11-24T18:00:00Z");

describe("renderProfile", () => {
  it("renders the Otto profile with the renamed headline, match table and best price", () => {
    const html = renderProfile(load("otto"), at);
    expect(html).toContain("Otto Floor Lamp is the Adesso Orchard");
    expect(html).toContain("Urban Outfitters&#39; name for");
    expect(html).toContain("How we know it");
    expect(html).toContain("$269.40");
    expect(html).toContain("About $52 below Target");
    expect(html).not.toMatch(/undefined|NaN|\[object/);
  });

  it("renders the Levi profile, shows the blocked promo and names HomeSquare cheapest", () => {
    const html = renderProfile(load("levi"), at);
    expect(html).toContain("Crosley Furniture Levi Sideboard in Maple");
    expect(html).toContain("Promo doesn't apply");
    expect(html).toContain("Cheapest right now: HomeSquare");
    expect(html).toContain(">Search <");
    expect(html).not.toMatch(/undefined|NaN|\[object/);
  });

  it("escapes text from records", () => {
    const rec = load("otto");
    rec.input.listingName = "<script>alert(1)</script>";
    expect(renderProfile(rec, at)).not.toContain("<script>alert(1)");
  });

  it("warns when prices are more than a day old", () => {
    expect(renderProfile(load("otto"), new Date("2026-11-27T00:00:00Z"))).toContain("more than a day old");
  });
});
