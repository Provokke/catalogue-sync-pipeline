export interface RawProduct {
  sku?: string;
  title?: string;
  price?: string | number;
  stock?: string | number;
  vendor?: string;
}

export interface Product {
  sku: string;
  title: string;
  /** Integer minor units (cents) to avoid float drift. */
  priceCents: number;
  stock: number;
  vendor: string;
}

export interface Adapter {
  name: string;
  parse(raw: string): Promise<RawProduct[]>;
}

/** Copy only defined fields, so optional properties stay absent (exactOptionalPropertyTypes). */
export function raw(fields: {
  sku: string | undefined;
  title: string | undefined;
  price: string | number | undefined;
  stock: string | number | undefined;
  vendor: string | undefined;
}): RawProduct {
  const out: RawProduct = {};
  if (fields.sku !== undefined) out.sku = fields.sku;
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.price !== undefined) out.price = fields.price;
  if (fields.stock !== undefined) out.stock = fields.stock;
  if (fields.vendor !== undefined) out.vendor = fields.vendor;
  return out;
}
