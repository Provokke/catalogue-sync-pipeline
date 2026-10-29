import { raw as rawProduct, type Adapter, type RawProduct } from "../types.js";

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): string | number | undefined =>
  typeof v === "string" || typeof v === "number" ? v : undefined;

export const jsonAdapter: Adapter = {
  name: "json",
  async parse(raw: string): Promise<RawProduct[]> {
    const data: unknown = JSON.parse(raw);
    const list: unknown = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) throw new Error("json feed: expected an array or { items: [] }");
    return list.map((entry: unknown) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      return rawProduct({
        sku: str(e.sku),
        title: str(e.name) ?? str(e.title),
        price: num(e.price),
        stock: num(e.qty) ?? num(e.stock),
        vendor: str(e.brand) ?? str(e.vendor),
      });
    });
  },
};
