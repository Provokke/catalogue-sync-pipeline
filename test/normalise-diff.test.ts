import { describe, expect, it } from "vitest";
import { diffCatalogue } from "../src/diff.js";
import { normalise } from "../src/normalise.js";
import type { Product } from "../src/types.js";

const p = (over: Partial<Product> = {}): Product => ({
  sku: "A",
  title: "Thing",
  priceCents: 1000,
  stock: 5,
  vendor: "V",
  ...over,
});

describe("normalise", () => {
  it("converts prices to integer cents", () => {
    expect(normalise({ sku: "A", title: "T", price: "$12.50", stock: "3" })).toEqual({
      product: { sku: "A", title: "T", priceCents: 1250, stock: 3, vendor: "" },
    });
    expect(normalise({ sku: "A", title: "T", price: 0.1 + 0.2 })).toMatchObject({ product: { priceCents: 30 } });
  });

  it("returns an error for missing sku, title, bad price or bad stock", () => {
    expect(normalise({ title: "T", price: 1 })).toEqual({ error: "missing sku" });
    expect(normalise({ sku: "A", price: 1 })).toHaveProperty("error");
    expect(normalise({ sku: "A", title: "T", price: "abc" })).toHaveProperty("error");
    expect(normalise({ sku: "A", title: "T", price: 1, stock: "x" })).toHaveProperty("error");
    expect(normalise({ sku: "A", title: "T", price: 1, stock: -2 })).toHaveProperty("error");
  });
});

describe("diffCatalogue", () => {
  it("diff detects price change only", () => {
    const d = diffCatalogue([p(), p({ sku: "B" })], [p({ priceCents: 1100 }), p({ sku: "B" })]);
    expect(d.create).toEqual([]);
    expect(d.archive).toEqual([]);
    expect(d.update).toEqual([p({ priceCents: 1100 })]);
  });

  it("detects creates and archives", () => {
    const d = diffCatalogue([p({ sku: "OLD" })], [p({ sku: "NEW" })]);
    expect(d.create.map((x) => x.sku)).toEqual(["NEW"]);
    expect(d.archive).toEqual(["OLD"]);
    expect(d.update).toEqual([]);
  });

  it("is empty when nothing changed", () => {
    expect(diffCatalogue([p()], [p()])).toEqual({ create: [], update: [], archive: [] });
  });
});
