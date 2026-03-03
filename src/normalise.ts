import type { Product, RawProduct } from "./types.js";

function parsePriceCents(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = typeof v === "number" ? v.toFixed(2) : v.replace(/[^0-9.]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(parseFloat(s) * 100);
}

function parseStock(v: string | number | undefined): number | undefined {
  if (v === undefined) return 0;
  const n = typeof v === "number" ? v : /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function normalise(r: RawProduct): { product: Product } | { error: string } {
  const sku = r.sku?.trim();
  if (!sku) return { error: "missing sku" };
  const title = r.title?.trim();
  if (!title) return { error: `${sku}: missing title` };
  const priceCents = parsePriceCents(r.price);
  if (priceCents === undefined) return { error: `${sku}: invalid price` };
  const stock = parseStock(r.stock);
  if (stock === undefined) return { error: `${sku}: invalid stock` };
  return { product: { sku, title, priceCents, stock, vendor: r.vendor?.trim() ?? "" } };
}
