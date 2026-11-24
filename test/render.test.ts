import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ProfileRecord } from "../src/schema";
import { renderProfile } from "../src/render";

const load = (name: string) => ProfileRecord.parse(JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")));
const at = new Date("2026-11-24T18:00:00Z");

describe("renderProfile", () => {
  it("renders the Otto profile with the renamed headline, best price, no match table", () => {
    const html = renderProfile(load("otto"), at);
    expect(html).toContain("Otto Floor Lamp is the Adesso Orchard");
    expect(html).toContain("Urban Outfitters&#39; name for");
    expect(html).not.toContain("How we know it");
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
    expect(html).toContain("Likely the same product, not yet confirmed");
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

describe("relative photos", () => {
  it("skips a library-relative photo unless an asset base is given", () => {
    const rec = load("otto");
    expect(rec.photo?.url).toBe("img/adesso-3932-12.jpg");
    expect(renderProfile(rec, at)).not.toContain("<img");
    expect(renderProfile(rec, at, { assetBase: "../" })).toContain('<img src="../img/adesso-3932-12.jpg"');
  });
});

describe("worth section", () => {
  it("renders the verdict and three checks when present", async () => {
    const { renderProfile } = await import("../src/render");
    const { ProfileRecord } = await import("../src/schema");
    const { readFileSync } = await import("node:fs");
    const rec = ProfileRecord.parse(JSON.parse(readFileSync("fixtures/wren.json", "utf8")));
    const html = renderProfile(rec, new Date(rec.checkedAt));
    expect(html).toContain("Worth it?");
    expect(html).toContain("Not worth it");
    expect(html).toContain("Your link vs other stores");
    expect(html).toContain("Materials for the price");
  });
  it("omits the section when a profile has no verdict", async () => {
    const { renderProfile } = await import("../src/render");
    const { ProfileRecord } = await import("../src/schema");
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync("fixtures/wren.json", "utf8"));
    delete raw.worth;
    const html = renderProfile(ProfileRecord.parse(raw), new Date(raw.checkedAt));
    expect(html).not.toContain("Worth it?");
  });
});
