import type { Product } from "./types.js";

const same = (a: Product, b: Product) =>
  a.title === b.title && a.priceCents === b.priceCents && a.stock === b.stock && a.vendor === b.vendor;

export function diffCatalogue(
  prev: Product[],
  next: Product[],
): { create: Product[]; update: Product[]; archive: string[] } {
  const before = new Map(prev.map((p) => [p.sku, p]));
  const after = new Set(next.map((p) => p.sku));
  const create: Product[] = [];
  const update: Product[] = [];
  for (const p of next) {
    const old = before.get(p.sku);
    if (!old) create.push(p);
    else if (!same(old, p)) update.push(p);
  }
  const archive = prev.filter((p) => !after.has(p.sku)).map((p) => p.sku);
  return { create, update, archive };
}
