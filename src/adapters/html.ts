import { raw as rawProduct, type Adapter, type RawProduct } from "../types.js";

const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** Reads the first <table>: header cells name the columns, each body row is one product. */
export const htmlAdapter: Adapter = {
  name: "html",
  async parse(raw: string): Promise<RawProduct[]> {
    const table = /<table[\s\S]*?<\/table>/i.exec(raw)?.[0] ?? "";
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
      [...m[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => decode(c[1] ?? "")),
    );
    const [header, ...body] = rows;
    if (!header) return [];
    const cols = header.map((h) => h.toLowerCase());
    const idx = (...names: string[]) => cols.findIndex((c) => names.includes(c));
    const iSku = idx("sku");
    const iTitle = idx("product", "title", "name");
    const iPrice = idx("price");
    const iStock = idx("in stock", "stock", "qty");
    const iVendor = idx("brand", "vendor");
    return body.map((cells) => {
      const pick = (i: number) => (i >= 0 ? cells[i] : undefined);
      return rawProduct({
        sku: pick(iSku),
        title: pick(iTitle),
        price: pick(iPrice),
        stock: pick(iStock),
        vendor: pick(iVendor),
      });
    });
  },
};
