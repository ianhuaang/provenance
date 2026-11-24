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

  it("renders a generic item without a model number and flags a sold-out input link", () => {
    const html = renderProfile(load("pop"), at);
    expect(html).toContain("Pop Glass Table Lamp is a generic design");
    expect(html).toContain("8 names");
    expect(html).toContain("Cheapest right now: Ember Lamps");
    expect(html).toContain("shows it sold out");
    expect(html).toContain("There's no model number");
    expect(html).not.toMatch(/undefined|NaN|\[object/);
  });

  it("renders the Keira as a likely renamed Livabliss lamp, cheapest verified at AllModern", () => {
    const html = renderProfile(load("keira"), at);
    expect(html).toContain("AllModern Keira 76&quot; Floor Lamp is the Livabliss Desota");
    expect(html).toContain("Treat this as a likely match");
    expect(html).toContain("Cheapest right now: AllModern");
    expect(html).toContain("Overstock lists it for $191");
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
