import { describe, expect, it } from "vitest";
import { csvAdapter, htmlAdapter, jsonAdapter } from "../src/adapters/index.js";
import { fixture } from "./helpers.js";

describe("adapters", () => {
  it("csv handles quoted commas and keeps every row", async () => {
    const rows = await csvAdapter.parse(fixture("supplier.csv"));
    expect(rows).toHaveLength(6);
    expect(rows[1]?.title).toBe("Steel Bottle, 750ml");
  });

  it("json maps name/qty/brand onto the common shape", async () => {
    const rows = await jsonAdapter.parse(fixture("supplier.json"));
    expect(rows[0]).toEqual({ sku: "JSON-001", title: "Oak Cutting Board", price: 32.5, stock: 12, vendor: "Birchwood" });
  });

  it("json rejects a feed that is not a list", async () => {
    await expect(jsonAdapter.parse('{"nope":1}')).rejects.toThrow(/expected an array/);
  });

  it("html reads table rows and decodes entities", async () => {
    const rows = await htmlAdapter.parse(fixture("supplier.html"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sku: "HTML-001", title: "Wool Blanket", price: "$45.00", vendor: "Hearth & Co" });
  });
});
